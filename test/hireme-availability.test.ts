import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAvailableSlots,
  intersectAvailability,
  normalizeIntervals,
  slotIsStillAvailable,
} from "../src/lib/hireme/availability";

test("normalizeIntervals merges overlapping and adjacent intervals", () => {
  assert.deepEqual(
    normalizeIntervals([
      {
        startsAt: "2026-09-24T13:00:00.000Z",
        endsAt: "2026-09-24T14:00:00.000Z",
      },
      {
        startsAt: "2026-09-24T13:30:00.000Z",
        endsAt: "2026-09-24T15:00:00.000Z",
      },
      {
        startsAt: "2026-09-24T15:00:00.000Z",
        endsAt: "2026-09-24T16:00:00.000Z",
      },
    ]),
    [
      {
        startsAt: "2026-09-24T13:00:00.000Z",
        endsAt: "2026-09-24T16:00:00.000Z",
      },
    ],
  );
});

test("intersectAvailability returns only common interviewer time", () => {
  assert.deepEqual(
    intersectAvailability({
      mark: [
        {
          startsAt: "2026-09-24T13:00:00.000Z",
          endsAt: "2026-09-24T17:00:00.000Z",
        },
      ],
      vex: [
        {
          startsAt: "2026-09-24T14:00:00.000Z",
          endsAt: "2026-09-24T16:00:00.000Z",
        },
      ],
      sukuna: [
        {
          startsAt: "2026-09-24T14:30:00.000Z",
          endsAt: "2026-09-24T18:00:00.000Z",
        },
      ],
    }),
    [
      {
        startsAt: "2026-09-24T14:30:00.000Z",
        endsAt: "2026-09-24T16:00:00.000Z",
      },
    ],
  );
});

test("calculateAvailableSlots subtracts bookings and buffers", () => {
  const slots = calculateAvailableSlots({
    interviewerAvailability: {
      mark: [
        {
          startsAt: "2026-09-24T13:00:00.000Z",
          endsAt: "2026-09-24T17:00:00.000Z",
        },
      ],
    },
    existingBookings: [
      {
        startsAt: "2026-09-24T14:00:00.000Z",
        endsAt: "2026-09-24T15:00:00.000Z",
      },
    ],
    durationMinutes: 30,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    slotStepMinutes: 30,
    minimumNoticeMinutes: 0,
    bookingHorizonDays: 30,
    now: "2026-09-20T00:00:00.000Z",
  });

  assert.deepEqual(
    slots.map((slot) => slot.startsAt),
    [
      "2026-09-24T13:00:00.000Z",
      "2026-09-24T15:30:00.000Z",
      "2026-09-24T16:00:00.000Z",
      "2026-09-24T16:30:00.000Z",
    ],
  );
});

test("calculateAvailableSlots enforces minimum notice", () => {
  const slots = calculateAvailableSlots({
    interviewerAvailability: {
      mark: [
        {
          startsAt: "2026-09-24T10:00:00.000Z",
          endsAt: "2026-09-24T14:00:00.000Z",
        },
      ],
    },
    durationMinutes: 60,
    minimumNoticeMinutes: 120,
    bookingHorizonDays: 1,
    now: "2026-09-24T09:00:00.000Z",
  });

  assert.deepEqual(
    slots.map((slot) => slot.startsAt),
    [
      "2026-09-24T11:00:00.000Z",
      "2026-09-24T12:00:00.000Z",
      "2026-09-24T13:00:00.000Z",
    ],
  );
});

test("slotIsStillAvailable requires an exact slot match", () => {
  const availableSlots = calculateAvailableSlots({
    interviewerAvailability: {
      mark: [
        {
          startsAt: "2026-09-24T10:00:00.000Z",
          endsAt: "2026-09-24T12:00:00.000Z",
        },
      ],
    },
    durationMinutes: 30,
    bookingHorizonDays: 1,
    now: "2026-09-24T09:00:00.000Z",
  });

  assert.equal(
    slotIsStillAvailable(
      {
        startsAt: "2026-09-24T10:30:00.000Z",
        endsAt: "2026-09-24T11:00:00.000Z",
      },
      availableSlots,
    ),
    true,
  );

  assert.equal(
    slotIsStillAvailable(
      {
        startsAt: "2026-09-24T10:15:00.000Z",
        endsAt: "2026-09-24T10:45:00.000Z",
      },
      availableSlots,
    ),
    false,
  );
});