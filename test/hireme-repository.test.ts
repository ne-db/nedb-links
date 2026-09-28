import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoryHireMeBookingRepository,
  bookingAsInterval,
} from "../src/lib/hireme/repository";
import type {
  Booking,
} from "../src/lib/hireme/types";

function makeBooking(
  overrides: Partial<Booking> = {},
): Booking {
  return {
    id: "booking-1",
    organizationId: "ourlynx",
    interviewTypeId: "technical",
    candidate: {
      name: "Sarah Johnson",
      email: "sarah@example.com",
    },
    participants: [
      {
        userId: "mark",
        role: "host",
      },
    ],
    startsAt: "2026-09-24T14:00:00.000Z",
    endsAt: "2026-09-24T15:00:00.000Z",
    timezone: "America/New_York",
    status: "confirmed",
    locationType: "video",
    location: "Google Meet",
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
    ...overrides,
  };
}

test("createIfSlotFree prevents concurrent double booking", async () => {
  const repository =
    new MemoryHireMeBookingRepository();

  const first = makeBooking({
    id: "booking-first",
  });
  const second = makeBooking({
    id: "booking-second",
    candidate: {
      name: "Alex Rivera",
      email: "alex@example.com",
    },
  });

  const results = await Promise.all([
    repository.createIfSlotFree(first),
    repository.createIfSlotFree(second),
  ]);

  assert.deepEqual(
    [...results].sort(),
    [false, true],
  );

  const stored = await repository.list({
    organizationId: "ourlynx",
  });

  assert.equal(stored.length, 1);
});

test("overlapping interviews are allowed for different interviewers", async () => {
  const repository =
    new MemoryHireMeBookingRepository();

  assert.equal(
    await repository.createIfSlotFree(
      makeBooking({
        id: "booking-mark",
      }),
    ),
    true,
  );

  assert.equal(
    await repository.createIfSlotFree(
      makeBooking({
        id: "booking-vex",
        participants: [
          {
            userId: "vex",
            role: "host",
          },
        ],
      }),
    ),
    true,
  );

  assert.equal(
    (
      await repository.list({
        organizationId: "ourlynx",
      })
    ).length,
    2,
  );
});

test("one shared interviewer makes overlapping panels conflict", async () => {
  const repository =
    new MemoryHireMeBookingRepository([
      makeBooking({
        id: "panel-one",
        participants: [
          {
            userId: "mark",
            role: "host",
          },
          {
            userId: "vex",
            role: "interviewer",
          },
        ],
      }),
    ]);

  const created =
    await repository.createIfSlotFree(
      makeBooking({
        id: "panel-two",
        participants: [
          {
            userId: "sukuna",
            role: "host",
          },
          {
            userId: "vex",
            role: "interviewer",
          },
        ],
        startsAt:
          "2026-09-24T14:30:00.000Z",
        endsAt:
          "2026-09-24T15:30:00.000Z",
      }),
    );

  assert.equal(created, false);
});

test("adjacent bookings do not overlap", async () => {
  const repository =
    new MemoryHireMeBookingRepository([
      makeBooking(),
    ]);

  assert.equal(
    await repository.createIfSlotFree(
      makeBooking({
        id: "booking-adjacent",
        startsAt:
          "2026-09-24T15:00:00.000Z",
        endsAt:
          "2026-09-24T16:00:00.000Z",
      }),
    ),
    true,
  );
});

test("cancelled bookings release their slot", async () => {
  const repository =
    new MemoryHireMeBookingRepository([
      makeBooking({
        status: "cancelled",
      }),
    ]);

  assert.equal(
    await repository.createIfSlotFree(
      makeBooking({
        id: "replacement",
      }),
    ),
    true,
  );
});

test("updateIfUnchanged rejects stale writes", async () => {
  const original = makeBooking();
  const repository =
    new MemoryHireMeBookingRepository([
      original,
    ]);

  const changed = {
    ...original,
    status: "cancelled" as const,
    updatedAt:
      "2026-09-21T12:00:00.000Z",
  };

  assert.equal(
    await repository.updateIfUnchanged(
      changed,
      "stale-version",
    ),
    false,
  );

  assert.equal(
    (await repository.getById(original.id))
      ?.status,
    "confirmed",
  );
});

test("rescheduling cannot move into an occupied interviewer slot", async () => {
  const first = makeBooking({
    id: "booking-first",
  });
  const second = makeBooking({
    id: "booking-second",
    startsAt:
      "2026-09-24T16:00:00.000Z",
    endsAt:
      "2026-09-24T17:00:00.000Z",
  });
  const repository =
    new MemoryHireMeBookingRepository([
      first,
      second,
    ]);

  const movedSecond: Booking = {
    ...second,
    startsAt: first.startsAt,
    endsAt: first.endsAt,
    updatedAt:
      "2026-09-21T12:00:00.000Z",
  };

  assert.equal(
    await repository.updateIfUnchanged(
      movedSecond,
      second.updatedAt,
    ),
    false,
  );

  assert.deepEqual(
    bookingAsInterval(
      (await repository.getById(second.id))!,
    ),
    {
      startsAt: second.startsAt,
      endsAt: second.endsAt,
    },
  );
});

test("list filters by organization, participant, status, and range", async () => {
  const repository =
    new MemoryHireMeBookingRepository([
      makeBooking({
        id: "matching",
      }),
      makeBooking({
        id: "cancelled",
        status: "cancelled",
      }),
      makeBooking({
        id: "different-person",
        participants: [
          {
            userId: "vex",
            role: "host",
          },
        ],
      }),
      makeBooking({
        id: "different-organization",
        organizationId: "another-org",
      }),
      makeBooking({
        id: "outside-range",
        startsAt:
          "2026-10-24T14:00:00.000Z",
        endsAt:
          "2026-10-24T15:00:00.000Z",
      }),
    ]);

  const bookings = await repository.list({
    organizationId: "ourlynx",
    participantId: "mark",
    statuses: ["confirmed"],
    startsBefore:
      "2026-09-25T00:00:00.000Z",
    endsAfter:
      "2026-09-24T00:00:00.000Z",
  });

  assert.deepEqual(
    bookings.map((booking) => booking.id),
    ["matching"],
  );
});

test("repository returns defensive copies", async () => {
  const repository =
    new MemoryHireMeBookingRepository([
      makeBooking(),
    ]);

  const loaded = await repository.getById(
    "booking-1",
  );

  assert.ok(loaded);

  loaded.candidate.name = "Mutated";
  loaded.participants[0].userId = "mutated";

  const reloaded = await repository.getById(
    "booking-1",
  );

  assert.equal(
    reloaded?.candidate.name,
    "Sarah Johnson",
  );
  assert.equal(
    reloaded?.participants[0].userId,
    "mark",
  );
});