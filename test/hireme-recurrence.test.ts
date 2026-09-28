import assert from "node:assert/strict";
import test from "node:test";

import {
  RecurrenceValidationError,
  expandAvailability,
} from "../src/lib/hireme/recurrence";
import type {
  AvailabilityOverride,
  AvailabilityRule,
} from "../src/lib/hireme/types";

function makeRule(
  overrides: Partial<AvailabilityRule> = {},
): AvailabilityRule {
  return {
    id: "rule-mark-weekdays",
    organizationId: "ourlynx",
    userId: "mark",
    timezone: "America/New_York",
    daysOfWeek: [1, 2, 3, 4],
    startTime: "10:00",
    endTime: "16:00",
    active: true,
    ...overrides,
  };
}

test("expandAvailability expands weekly rules into UTC", () => {
  const expanded = expandAvailability({
    rules: [makeRule()],
    userIds: ["mark"],
    range: {
      startsAt: "2026-09-21T00:00:00.000Z",
      endsAt: "2026-09-26T00:00:00.000Z",
    },
  });

  assert.deepEqual(expanded.mark, [
    {
      startsAt: "2026-09-21T14:00:00.000Z",
      endsAt: "2026-09-21T20:00:00.000Z",
    },
    {
      startsAt: "2026-09-22T14:00:00.000Z",
      endsAt: "2026-09-22T20:00:00.000Z",
    },
    {
      startsAt: "2026-09-23T14:00:00.000Z",
      endsAt: "2026-09-23T20:00:00.000Z",
    },
    {
      startsAt: "2026-09-24T14:00:00.000Z",
      endsAt: "2026-09-24T20:00:00.000Z",
    },
  ]);
});

test("unavailable date overrides replace recurring availability", () => {
  const override: AvailabilityOverride = {
    id: "override-pto",
    organizationId: "ourlynx",
    userId: "mark",
    date: "2026-09-22",
    timezone: "America/New_York",
    available: false,
    intervals: [],
    reason: "PTO",
  };

  const expanded = expandAvailability({
    rules: [makeRule()],
    overrides: [override],
    userIds: ["mark"],
    range: {
      startsAt: "2026-09-21T00:00:00.000Z",
      endsAt: "2026-09-23T23:59:59.999Z",
    },
  });

  assert.deepEqual(expanded.mark, [
    {
      startsAt: "2026-09-21T14:00:00.000Z",
      endsAt: "2026-09-21T20:00:00.000Z",
    },
    {
      startsAt: "2026-09-23T14:00:00.000Z",
      endsAt: "2026-09-23T20:00:00.000Z",
    },
  ]);
});

test("available date overrides replace the recurring rule", () => {
  const override: AvailabilityOverride = {
    id: "override-short-day",
    organizationId: "ourlynx",
    userId: "mark",
    date: "2026-09-22",
    timezone: "America/New_York",
    available: true,
    intervals: [
      {
        startsAt: "2026-09-22T17:00:00.000Z",
        endsAt: "2026-09-22T19:00:00.000Z",
      },
    ],
  };

  const expanded = expandAvailability({
    rules: [makeRule()],
    overrides: [override],
    userIds: ["mark"],
    range: {
      startsAt: "2026-09-22T00:00:00.000Z",
      endsAt: "2026-09-23T00:00:00.000Z",
    },
  });

  assert.deepEqual(expanded.mark, [
    {
      startsAt: "2026-09-22T17:00:00.000Z",
      endsAt: "2026-09-22T19:00:00.000Z",
    },
  ]);
});

test("expandAvailability observes daylight-saving offsets", () => {
  const expanded = expandAvailability({
    rules: [
      makeRule({
        daysOfWeek: [1],
        startTime: "10:00",
        endTime: "11:00",
      }),
    ],
    userIds: ["mark"],
    range: {
      startsAt: "2026-10-26T00:00:00.000Z",
      endsAt: "2026-11-10T00:00:00.000Z",
    },
  });

  assert.deepEqual(expanded.mark, [
    {
      startsAt: "2026-10-26T14:00:00.000Z",
      endsAt: "2026-10-26T15:00:00.000Z",
    },
    {
      startsAt: "2026-11-02T15:00:00.000Z",
      endsAt: "2026-11-02T16:00:00.000Z",
    },
    {
      startsAt: "2026-11-09T15:00:00.000Z",
      endsAt: "2026-11-09T16:00:00.000Z",
    },
  ]);
});

test("expandAvailability handles overnight rules", () => {
  const expanded = expandAvailability({
    rules: [
      makeRule({
        daysOfWeek: [5],
        startTime: "22:00",
        endTime: "02:00",
      }),
    ],
    userIds: ["mark"],
    range: {
      startsAt: "2026-09-25T00:00:00.000Z",
      endsAt: "2026-09-27T12:00:00.000Z",
    },
  });

  assert.deepEqual(expanded.mark, [
    {
      startsAt: "2026-09-26T02:00:00.000Z",
      endsAt: "2026-09-26T06:00:00.000Z",
    },
  ]);
});

test("expandAvailability intersects output with the requested range", () => {
  const expanded = expandAvailability({
    rules: [
      makeRule({
        daysOfWeek: [1],
      }),
    ],
    userIds: ["mark"],
    range: {
      startsAt: "2026-09-21T16:00:00.000Z",
      endsAt: "2026-09-21T18:00:00.000Z",
    },
  });

  assert.deepEqual(expanded.mark, [
    {
      startsAt: "2026-09-21T16:00:00.000Z",
      endsAt: "2026-09-21T18:00:00.000Z",
    },
  ]);
});

test("expandAvailability supports multiple isolated interviewers", () => {
  const expanded = expandAvailability({
    rules: [
      makeRule({
        userId: "mark",
        daysOfWeek: [1],
      }),
      makeRule({
        id: "rule-vex",
        userId: "vex",
        daysOfWeek: [1],
        startTime: "12:00",
        endTime: "18:00",
      }),
    ],
    userIds: ["mark", "vex", "sukuna"],
    range: {
      startsAt: "2026-09-21T00:00:00.000Z",
      endsAt: "2026-09-22T00:00:00.000Z",
    },
  });

  assert.deepEqual(expanded, {
    mark: [
      {
        startsAt: "2026-09-21T14:00:00.000Z",
        endsAt: "2026-09-21T20:00:00.000Z",
      },
    ],
    vex: [
      {
        startsAt: "2026-09-21T16:00:00.000Z",
        endsAt: "2026-09-21T22:00:00.000Z",
      },
    ],
    sukuna: [],
  });
});

test("expandAvailability honors effective rule dates", () => {
  const expanded = expandAvailability({
    rules: [
      makeRule({
        daysOfWeek: [1, 2, 3, 4],
        effectiveFrom: "2026-09-22",
        effectiveUntil: "2026-09-23",
      }),
    ],
    userIds: ["mark"],
    range: {
      startsAt: "2026-09-21T00:00:00.000Z",
      endsAt: "2026-09-25T00:00:00.000Z",
    },
  });

  assert.deepEqual(
    expanded.mark.map((interval) => interval.startsAt),
    [
      "2026-09-22T14:00:00.000Z",
      "2026-09-23T14:00:00.000Z",
    ],
  );
});

test("expandAvailability rejects nonexistent DST local times", () => {
  assert.throws(
    () =>
      expandAvailability({
        rules: [
          makeRule({
            daysOfWeek: [0],
            startTime: "02:30",
            endTime: "03:30",
          }),
        ],
        userIds: ["mark"],
        range: {
          startsAt: "2026-03-08T00:00:00.000Z",
          endsAt: "2026-03-09T00:00:00.000Z",
        },
      }),
    (error: unknown) =>
      error instanceof RecurrenceValidationError &&
      error.code === "nonexistent_local_time",
  );
});

test("expandAvailability rejects invalid timezones", () => {
  assert.throws(
    () =>
      expandAvailability({
        rules: [
          makeRule({
            timezone: "Mars/Olympus_Mons",
          }),
        ],
        userIds: ["mark"],
        range: {
          startsAt: "2026-09-21T00:00:00.000Z",
          endsAt: "2026-09-22T00:00:00.000Z",
        },
      }),
    (error: unknown) =>
      error instanceof RecurrenceValidationError &&
      error.code === "invalid_timezone",
  );
});