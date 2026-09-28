import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import test from "node:test";

import {
  BookingLifecycleError,
  cancelBooking,
  rescheduleBooking,
  type BookingLifecycleRepository,
} from "../src/lib/hireme/lifecycle";
import {
  tokenMatches,
} from "../src/lib/hireme/booking";
import type {
  Booking,
} from "../src/lib/hireme/types";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function makeBooking(): Booking {
  return {
    id: "booking-1",
    organizationId: "ourlynx",
    interviewTypeId: "technical",
    candidateId: "candidate-sarah",
    jobId: "senior-software-engineer",
    candidate: {
      name: "Sarah Johnson",
      email: "sarah@example.com",
      timezone: "America/Chicago",
    },
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
    startsAt: "2026-09-24T14:00:00.000Z",
    endsAt: "2026-09-24T15:00:00.000Z",
    timezone: "America/New_York",
    status: "confirmed",
    locationType: "video",
    location: "Google Meet",
    cancellationTokenHash: hashToken("cancel-original"),
    rescheduleTokenHash: hashToken("reschedule-original"),
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
  };
}

class MemoryLifecycleRepository
implements BookingLifecycleRepository {
  booking: Booking | null;
  rejectUpdate = false;

  constructor(booking: Booking | null = makeBooking()) {
    this.booking = booking;
  }

  async getById(id: string): Promise<Booking | null> {
    if (this.booking?.id !== id) {
      return null;
    }

    return {
      ...this.booking,
      candidate: {
        ...this.booking.candidate,
      },
      participants: this.booking.participants.map(
        (participant) => ({ ...participant }),
      ),
    };
  }

  async updateIfUnchanged(
    booking: Booking,
    expectedUpdatedAt: string,
  ): Promise<boolean> {
    if (
      this.rejectUpdate ||
      !this.booking ||
      this.booking.updatedAt !== expectedUpdatedAt
    ) {
      return false;
    }

    this.booking = booking;
    return true;
  }
}

test("cancelBooking cancels an active booking and consumes both tokens", async () => {
  const repository = new MemoryLifecycleRepository();

  const booking = await cancelBooking(
    repository,
    "booking-1",
    "cancel-original",
    {
      now: () =>
        new Date("2026-09-21T12:00:00.000Z"),
    },
  );

  assert.equal(booking.status, "cancelled");
  assert.equal(booking.cancellationTokenHash, undefined);
  assert.equal(booking.rescheduleTokenHash, undefined);
  assert.equal(
    booking.updatedAt,
    "2026-09-21T12:00:00.000Z",
  );
  assert.equal(repository.booking, booking);
});

test("cancelBooking rejects an invalid cancellation token", async () => {
  const repository = new MemoryLifecycleRepository();

  await assert.rejects(
    cancelBooking(
      repository,
      "booking-1",
      "wrong-token",
    ),
    (error: unknown) =>
      error instanceof BookingLifecycleError &&
      error.code === "invalid_token",
  );

  assert.equal(repository.booking?.status, "confirmed");
});

test("cancelBooking rejects repeated cancellation", async () => {
  const booking = makeBooking();
  booking.status = "cancelled";
  const repository = new MemoryLifecycleRepository(booking);

  await assert.rejects(
    cancelBooking(
      repository,
      "booking-1",
      "cancel-original",
    ),
    (error: unknown) =>
      error instanceof BookingLifecycleError &&
      error.code === "booking_not_active",
  );
});

test("rescheduleBooking moves the booking and rotates tokens", async () => {
  const repository = new MemoryLifecycleRepository();
  const generatedTokens = [
    "cancel-rotated",
    "reschedule-rotated",
  ];

  const result = await rescheduleBooking(
    repository,
    {
      bookingId: "booking-1",
      token: "reschedule-original",
      slot: {
        startsAt: "2026-09-25T10:00:00-04:00",
        endsAt: "2026-09-25T11:00:00-04:00",
      },
      availableSlots: [
        {
          startsAt: "2026-09-25T14:00:00.000Z",
          endsAt: "2026-09-25T15:00:00.000Z",
          durationMinutes: 60,
        },
      ],
    },
    {
      now: () =>
        new Date("2026-09-21T13:00:00.000Z"),
      token: () => {
        const token = generatedTokens.shift();

        if (!token) {
          throw new Error("No lifecycle token left");
        }

        return token;
      },
    },
  );

  assert.equal(
    result.booking.startsAt,
    "2026-09-25T14:00:00.000Z",
  );
  assert.equal(
    result.booking.endsAt,
    "2026-09-25T15:00:00.000Z",
  );
  assert.equal(result.booking.status, "confirmed");
  assert.equal(
    result.cancellationToken,
    "cancel-rotated",
  );
  assert.equal(
    result.rescheduleToken,
    "reschedule-rotated",
  );
  assert.equal(
    tokenMatches(
      "cancel-rotated",
      result.booking.cancellationTokenHash,
    ),
    true,
  );
  assert.equal(
    tokenMatches(
      "reschedule-rotated",
      result.booking.rescheduleTokenHash,
    ),
    true,
  );
  assert.equal(
    tokenMatches(
      "cancel-original",
      result.booking.cancellationTokenHash,
    ),
    false,
  );
  assert.equal(
    tokenMatches(
      "reschedule-original",
      result.booking.rescheduleTokenHash,
    ),
    false,
  );
});

test("rescheduleBooking rejects unavailable slots", async () => {
  const repository = new MemoryLifecycleRepository();

  await assert.rejects(
    rescheduleBooking(repository, {
      bookingId: "booking-1",
      token: "reschedule-original",
      slot: {
        startsAt: "2026-09-25T16:00:00.000Z",
        endsAt: "2026-09-25T17:00:00.000Z",
      },
      availableSlots: [
        {
          startsAt: "2026-09-25T14:00:00.000Z",
          endsAt: "2026-09-25T15:00:00.000Z",
          durationMinutes: 60,
        },
      ],
    }),
    (error: unknown) =>
      error instanceof BookingLifecycleError &&
      error.code === "slot_unavailable",
  );

  assert.equal(
    repository.booking?.startsAt,
    "2026-09-24T14:00:00.000Z",
  );
});

test("rescheduleBooking preserves the original duration", async () => {
  const repository = new MemoryLifecycleRepository();

  await assert.rejects(
    rescheduleBooking(repository, {
      bookingId: "booking-1",
      token: "reschedule-original",
      slot: {
        startsAt: "2026-09-25T14:00:00.000Z",
        endsAt: "2026-09-25T14:30:00.000Z",
      },
      availableSlots: [
        {
          startsAt: "2026-09-25T14:00:00.000Z",
          endsAt: "2026-09-25T14:30:00.000Z",
          durationMinutes: 30,
        },
      ],
    }),
    (error: unknown) =>
      error instanceof BookingLifecycleError &&
      error.code === "invalid_slot",
  );
});

test("lifecycle writes fail safely when the booking changed", async () => {
  const repository = new MemoryLifecycleRepository();
  repository.rejectUpdate = true;

  await assert.rejects(
    cancelBooking(
      repository,
      "booking-1",
      "cancel-original",
    ),
    (error: unknown) =>
      error instanceof BookingLifecycleError &&
      error.code === "booking_changed",
  );

  assert.equal(repository.booking?.status, "confirmed");
});

test("lifecycle reports missing bookings without leaking details", async () => {
  const repository = new MemoryLifecycleRepository(null);

  await assert.rejects(
    cancelBooking(
      repository,
      "missing-booking",
      "cancel-original",
    ),
    (error: unknown) =>
      error instanceof BookingLifecycleError &&
      error.code === "booking_not_found",
  );
});