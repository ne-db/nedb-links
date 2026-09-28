import {
  normalizeIntervals,
} from "./availability";
import type {
  AvailabilityOverride,
  AvailabilityRule,
  TimeInterval,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface ExpandAvailabilityInput {
  rules: AvailabilityRule[];
  overrides?: AvailabilityOverride[];
  userIds: string[];
  range: TimeInterval;
}

export type ExpandedAvailability = Record<
  string,
  TimeInterval[]
>;

export class RecurrenceValidationError extends Error {
  readonly code:
    | "invalid_range"
    | "invalid_date"
    | "invalid_time"
    | "invalid_timezone"
    | "nonexistent_local_time";

  constructor(
    code: RecurrenceValidationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RecurrenceValidationError";
    this.code = code;
  }
}

function parseRange(range: TimeInterval): {
  start: number;
  end: number;
} {
  const start = Date.parse(range.startsAt);
  const end = Date.parse(range.endsAt);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    throw new RecurrenceValidationError(
      "invalid_range",
      "Availability range must contain valid start and end times",
    );
  }

  return { start, end };
}

function parseDate(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new RecurrenceValidationError(
      "invalid_date",
      `Invalid local date: ${value}`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new RecurrenceValidationError(
      "invalid_date",
      `Invalid local date: ${value}`,
    );
  }

  return { year, month, day };
}

function parseTime(value: string): {
  hour: number;
  minute: number;
} {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    throw new RecurrenceValidationError(
      "invalid_time",
      `Invalid local time: ${value}`,
    );
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new RecurrenceValidationError(
      "invalid_time",
      `Invalid local time: ${value}`,
    );
  }

  return { hour, minute };
}

function formatterFor(
  timezone: string,
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      calendar: "iso8601",
      numberingSystem: "latn",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    throw new RecurrenceValidationError(
      "invalid_timezone",
      `Invalid timezone: ${timezone}`,
    );
  }
}

function partsAt(
  timestamp: number,
  formatter: Intl.DateTimeFormat,
): LocalDateTime & { second: number } {
  const values: Record<string, number> = {};

  for (const part of formatter.formatToParts(timestamp)) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function sameLocalMinute(
  left: LocalDateTime,
  right: LocalDateTime,
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function localDateTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): number {
  const dateParts = parseDate(date);
  const timeParts = parseTime(time);
  const desired: LocalDateTime = {
    ...dateParts,
    ...timeParts,
  };
  const formatter = formatterFor(timezone);
  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );

  let candidate = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = partsAt(candidate, formatter);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const difference = desiredAsUtc - actualAsUtc;

    if (difference === 0) {
      break;
    }

    candidate += difference;
  }

  const actual = partsAt(candidate, formatter);

  if (!sameLocalMinute(actual, desired)) {
    throw new RecurrenceValidationError(
      "nonexistent_local_time",
      `${date} ${time} does not exist in ${timezone}`,
    );
  }

  return candidate;
}

function dateFromEpochDay(epochDay: number): string {
  return new Date(epochDay * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function epochDayForDate(date: string): number {
  const parsed = parseDate(date);

  return Math.floor(
    Date.UTC(
      parsed.year,
      parsed.month - 1,
      parsed.day,
    ) / DAY_MS,
  );
}

function weekdayForDate(date: string): number {
  const parsed = parseDate(date);

  return new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  ).getUTCDay();
}

function intervalForRule(
  rule: AvailabilityRule,
  date: string,
): TimeInterval {
  const startsAt = localDateTimeToUtc(
    date,
    rule.startTime,
    rule.timezone,
  );

  let endDate = date;
  const startTime = parseTime(rule.startTime);
  const endTime = parseTime(rule.endTime);
  const startMinute = startTime.hour * 60 + startTime.minute;
  const endMinute = endTime.hour * 60 + endTime.minute;

  if (endMinute === startMinute) {
    throw new RecurrenceValidationError(
      "invalid_time",
      "Availability rule start and end times cannot match",
    );
  }

  if (endMinute < startMinute) {
    endDate = dateFromEpochDay(epochDayForDate(date) + 1);
  }

  const endsAt = localDateTimeToUtc(
    endDate,
    rule.endTime,
    rule.timezone,
  );

  if (endsAt <= startsAt) {
    throw new RecurrenceValidationError(
      "invalid_time",
      "Availability rule must end after it starts",
    );
  }

  return {
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
  };
}

function clipInterval(
  interval: TimeInterval,
  rangeStart: number,
  rangeEnd: number,
): TimeInterval | null {
  const startsAt = Date.parse(interval.startsAt);
  const endsAt = Date.parse(interval.endsAt);

  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt
  ) {
    throw new RecurrenceValidationError(
      "invalid_range",
      "Availability interval is invalid",
    );
  }

  const clippedStart = Math.max(startsAt, rangeStart);
  const clippedEnd = Math.min(endsAt, rangeEnd);

  if (clippedEnd <= clippedStart) {
    return null;
  }

  return {
    startsAt: new Date(clippedStart).toISOString(),
    endsAt: new Date(clippedEnd).toISOString(),
  };
}

function ruleAppliesOnDate(
  rule: AvailabilityRule,
  date: string,
): boolean {
  return (
    rule.active &&
    rule.daysOfWeek.includes(weekdayForDate(date)) &&
    (!rule.effectiveFrom || date >= rule.effectiveFrom) &&
    (!rule.effectiveUntil || date <= rule.effectiveUntil)
  );
}

function overridesByUserAndDate(
  overrides: AvailabilityOverride[],
): Map<string, AvailabilityOverride> {
  const indexed = new Map<string, AvailabilityOverride>();

  for (const override of overrides) {
    parseDate(override.date);
    formatterFor(override.timezone);
    indexed.set(
      `${override.userId}\u0000${override.date}`,
      override,
    );
  }

  return indexed;
}

function datesToScan(
  rangeStart: number,
  rangeEnd: number,
): string[] {
  const firstDay =
    Math.floor(rangeStart / DAY_MS) - 2;
  const lastDay =
    Math.floor((rangeEnd - 1) / DAY_MS) + 2;
  const dates: string[] = [];

  for (
    let epochDay = firstDay;
    epochDay <= lastDay;
    epochDay += 1
  ) {
    dates.push(dateFromEpochDay(epochDay));
  }

  return dates;
}

export function expandAvailability(
  input: ExpandAvailabilityInput,
): ExpandedAvailability {
  const range = parseRange(input.range);
  const userIds = Array.from(new Set(input.userIds));
  const users = new Set(userIds);
  const rules = input.rules.filter((rule) =>
    users.has(rule.userId),
  );
  const overrides = overridesByUserAndDate(
    (input.overrides ?? []).filter((override) =>
      users.has(override.userId),
    ),
  );
  const dates = datesToScan(range.start, range.end);
  const expanded: ExpandedAvailability = {};

  for (const userId of userIds) {
    const intervals: TimeInterval[] = [];
    const userRules = rules.filter(
      (rule) => rule.userId === userId,
    );

    for (const date of dates) {
      const override = overrides.get(
        `${userId}\u0000${date}`,
      );

      if (override) {
        if (override.available) {
          for (const interval of override.intervals) {
            const clipped = clipInterval(
              interval,
              range.start,
              range.end,
            );

            if (clipped) {
              intervals.push(clipped);
            }
          }
        }

        continue;
      }

      for (const rule of userRules) {
        if (!ruleAppliesOnDate(rule, date)) {
          continue;
        }

        const clipped = clipInterval(
          intervalForRule(rule, date),
          range.start,
          range.end,
        );

        if (clipped) {
          intervals.push(clipped);
        }
      }
    }

    expanded[userId] = normalizeIntervals(intervals);
  }

  return expanded;
}