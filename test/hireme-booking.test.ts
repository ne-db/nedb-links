import assert from "node:assert/strict";
import test from "node:test";

import {
  BookingConflictError,
  BookingValidationError,
  createBooking,
  tokenMatches,
  type BookingRepository,
} from "../src/lib/hireme/booking";
import type {
  Booking,
  InterviewType,
} from "../src/lib/hireme/types";

const interviewType: InterviewType = {
  id: "technical",
  organizationId: "ourlynx",
  ownerId: "mark",
  slug: "software-engineer",
  title: "Software Engineer Technical Interview",
  durationMinutes: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  minimumNoticeMinutes: 720,
  bookingHorizonDays: 21,
  timezone: "America/New_York",
  interviewerIds: ["mark", "vex"],
  jobId: "senior-software-engineer",
  locationType: "video",
  location: "Google Meet",
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

class MemoryBookingRepository implements BookingRepository {
  booking: Booking | null = null;
  acceptCreate = true;

  async createIfSlotFree(booking: Booking): Promise<boolean> {
    if (!this.acceptCreate) {
      return false;
    }

    this.booking = booking;
    return true;
  }

  async getById(id: string): Promise<Booking | null> {
    return this.booking?.id === id ? this.booking : null;
  }

  async update(booking: Booking): Promise<void> {
    this.booking = booking;
  }
}

test("createBooking creates a confirmed UTC booking", async () => {
  const repository = new MemoryBookingRepository();
  const tokens = [
    "cancel-secret-token",
    "reschedule-secret-token",
  ];

  const result = await createBooking(
    repository,
    {
      organizationId: "ourlynx",
      interviewType,
      candidateId: "candidate-sarah",
      candidate: {
        name: "  Sarah Johnson  ",
        email: " SARAH@EXAMPLE.COM ",
        phone: "  +1 555 0100 ",
        timezone: "America/Chicago",
      },
      slot: {
        startsAt: "2026-09-24T10:00:00-04:00",
        endsAt: "2026-09-24T11:00:00-04:00",
      },
      availableSlots: [
        {
          startsAt: "2026-09-24T14:00:00.000Z",
          endsAt: "2026-09-24T15:00:00.000Z",
          durationMinutes: 60,
        },
      ],
    },
    {
      id: () => "booking-1",
      now: () => new Date("2026-09-20T12:00:00.000Z"),
      token: () => {
        const token = tokens.shift();

        if (!token) {
          throw new Error("No token left");
        }

        return token;
      },
    },
  );

  assert.equal(result.booking.id, "booking-1");
  assert.equal(
    result.booking.startsAt,
    "2026-09-24T14:00:00.000Z",
  );
  assert.equal(
    result.booking.endsAt,
    "2026-09-24T15:00:00.000Z",
  );
  assert.equal(result.booking.status, "confirmed");
  assert.equal(result.booking.candidate.name, "Sarah Johnson");
  assert.equal(
    result.booking.candidate.email,
    "sarah@example.com",
  );
  assert.equal(result.booking.jobId, "senior-software-engineer");
  assert.deepEqual(result.booking.participants, [
    {
      userId: "mark",
      role: "host",
    },
    {
      userId: "vex",
      role: "interviewer",
    },
  ]);

  assert.equal(
    tokenMatches(
      result.tokens.cancellationToken,
      result.booking.cancellationTokenHash,
    ),
    true,
  );
  assert.equal(
    tokenMatches(
      result.tokens.rescheduleToken,
      result.booking.rescheduleTokenHash,
    ),
    true,
  );
  assert.equal(
    result.booking.cancellationTokenHash ===
      result.tokens.cancellationToken,
    false,
  );
  assert.equal(repository.booking, result.booking);
});

test("createBooking rejects a slot outside calculated availability", async () => {
  const repository = new MemoryBookingRepository();

  await assert.rejects(
    createBooking(repository, {
      organizationId: "ourlynx",
      interviewType,
      candidate: {
        name: "Sarah Johnson",
        email: "sarah@example.com",
      },
      slot: {
        startsAt: "2026-09-24T16:00:00.000Z",
        endsAt: "2026-09-24T17:00:00.000Z",
      },
      availableSlots: [
        {
          startsAt: "2026-09-24T14:00:00.000Z",
          endsAt: "2026-09-24T15:00:00.000Z",
          durationMinutes: 60,
        },
      ],
    }),
    (error: unknown) =>
      error instanceof BookingValidationError &&
      error.code === "slot_unavailable",
  );

  assert.equal(repository.booking, null);
});

test("createBooking rejects an invalid candidate email", async () => {
  const repository = new MemoryBookingRepository();

  await assert.rejects(
    createBooking(repository, {
      organizationId: "ourlynx",
      interviewType,
      candidate: {
        name: "Sarah Johnson",
        email: "not-an-email",
      },
      slot: {
        startsAt: "2026-09-24T14:00:00.000Z",
        endsAt: "2026-09-24T15:00:00.000Z",
      },
      availableSlots: [
        {
          startsAt: "2026-09-24T14:00:00.000Z",
          endsAt: "2026-09-24T15:00:00.000Z",
          durationMinutes: 60,
        },
      ],
    }),
    (error: unknown) =>
      error instanceof BookingValidationError &&
      error.code === "invalid_candidate",
  );
});

test("createBooking rejects a mismatched duration", async () => {
  const repository = new MemoryBookingRepository();

  await assert.rejects(
    createBooking(repository, {
      organizationId: "ourlynx",
      interviewType,
      candidate: {
        name: "Sarah Johnson",
        email: "sarah@example.com",
      },
      slot: {
        startsAt: "2026-09-24T14:00:00.000Z",
        endsAt: "2026-09-24T14:30:00.000Z",
      },
      availableSlots: [
        {
          startsAt: "2026-09-24T14:00:00.000Z",
          endsAt: "2026-09-24T14:30:00.000Z",
          durationMinutes: 30,
        },
      ],
    }),
    (error: unknown) =>
      error instanceof BookingValidationError &&
      error.code === "invalid_slot",
  );
});

test("createBooking reports an atomic slot race as a conflict", async () => {
  const repository = new MemoryBookingRepository();
  repository.acceptCreate = false;

  await assert.rejects(
    createBooking(
      repository,
      {
        organizationId: "ourlynx",
        interviewType,
        candidate: {
          name: "Sarah Johnson",
          email: "sarah@example.com",
        },
        slot: {
          startsAt: "2026-09-24T14:00:00.000Z",
          endsAt: "2026-09-24T15:00:00.000Z",
        },
        availableSlots: [
          {
            startsAt: "2026-09-24T14:00:00.000Z",
            endsAt: "2026-09-24T15:00:00.000Z",
            durationMinutes: 60,
          },
        ],
      },
      {
        token: (() => {
          let sequence = 0;
          return () => `token-${sequence += 1}`;
        })(),
      },
    ),
    BookingConflictError,
  );

  assert.equal(repository.booking, null);
});

test("createBooking deduplicates the owner from interviewers", async () => {
  const repository = new MemoryBookingRepository();

  const result = await createBooking(
    repository,
    {
      organizationId: "ourlynx",
      interviewType: {
        ...interviewType,
        interviewerIds: ["mark", "mark", "vex"],
      },
      candidate: {
        name: "Sarah Johnson",
        email: "sarah@example.com",
      },
      slot: {
        startsAt: "2026-09-24T14:00:00.000Z",
        endsAt: "2026-09-24T15:00:00.000Z",
      },
      availableSlots: [
        {
          startsAt: "2026-09-24T14:00:00.000Z",
          endsAt: "2026-09-24T15:00:00.000Z",
          durationMinutes: 60,
        },
      ],
    },
    {
      token: (() => {
        let sequence = 0;
        return () => `token-${sequence += 1}`;
      })(),
    },
  );

  assert.deepEqual(
    result.booking.participants.map(
      (participant) => participant.userId,
    ),
    ["mark", "vex"],
  );
});