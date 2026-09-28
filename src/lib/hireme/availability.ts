import type {
  AvailabilityInput,
  AvailableSlot,
  IsoDateTime,
  TimeInterval,
} from "./types";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

interface NumericInterval {
  start: number;
  end: number;
}

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

function parseTimestamp(value: IsoDateTime, field: string): number {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} must be a valid ISO date-time`);
  }

  return timestamp;
}

function toNumericInterval(
  interval: TimeInterval,
  field: string,
): NumericInterval {
  const start = parseTimestamp(interval.startsAt, `${field}.startsAt`);
  const end = parseTimestamp(interval.endsAt, `${field}.endsAt`);

  if (end <= start) {
    throw new Error(`${field}.endsAt must be after startsAt`);
  }

  return { start, end };
}

function toTimeInterval(interval: NumericInterval): TimeInterval {
  return {
    startsAt: new Date(interval.start).toISOString(),
    endsAt: new Date(interval.end).toISOString(),
  };
}

function mergeNumericIntervals(
  intervals: NumericInterval[],
): NumericInterval[] {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = intervals
    .map((interval) => ({ ...interval }))
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: NumericInterval[] = [sorted[0]];

  for (const interval of sorted.slice(1)) {
    const current = merged[merged.length - 1];

    if (interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end);
      continue;
    }

    merged.push(interval);
  }

  return merged;
}

function intersectTwoSets(
  left: NumericInterval[],
  right: NumericInterval[],
): NumericInterval[] {
  const intersections: NumericInterval[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    const leftInterval = left[leftIndex];
    const rightInterval = right[rightIndex];
    const start = Math.max(leftInterval.start, rightInterval.start);
    const end = Math.min(leftInterval.end, rightInterval.end);

    if (start < end) {
      intersections.push({ start, end });
    }

    if (leftInterval.end < rightInterval.end) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  return intersections;
}

function subtractIntervals(
  available: NumericInterval[],
  blocked: NumericInterval[],
): NumericInterval[] {
  if (blocked.length === 0) {
    return available;
  }

  const result: NumericInterval[] = [];

  for (const source of available) {
    let fragments: NumericInterval[] = [{ ...source }];

    for (const exclusion of blocked) {
      if (exclusion.end <= source.start) {
        continue;
      }

      if (exclusion.start >= source.end) {
        break;
      }

      const nextFragments: NumericInterval[] = [];

      for (const fragment of fragments) {
        if (
          exclusion.end <= fragment.start ||
          exclusion.start >= fragment.end
        ) {
          nextFragments.push(fragment);
          continue;
        }

        if (exclusion.start > fragment.start) {
          nextFragments.push({
            start: fragment.start,
            end: Math.min(exclusion.start, fragment.end),
          });
        }

        if (exclusion.end < fragment.end) {
          nextFragments.push({
            start: Math.max(exclusion.end, fragment.start),
            end: fragment.end,
          });
        }
      }

      fragments = nextFragments;

      if (fragments.length === 0) {
        break;
      }
    }

    result.push(...fragments);
  }

  return result;
}

function ceilToStep(timestamp: number, stepMs: number): number {
  return Math.ceil(timestamp / stepMs) * stepMs;
}

export function normalizeIntervals(
  intervals: TimeInterval[],
): TimeInterval[] {
  return mergeNumericIntervals(
    intervals.map((interval, index) =>
      toNumericInterval(interval, `intervals[${index}]`),
    ),
  ).map(toTimeInterval);
}

export function intersectAvailability(
  interviewerAvailability: Record<string, TimeInterval[]>,
): TimeInterval[] {
  const entries = Object.entries(interviewerAvailability);

  if (entries.length === 0) {
    return [];
  }

  let common = mergeNumericIntervals(
    entries[0][1].map((interval, index) =>
      toNumericInterval(interval, `${entries[0][0]}[${index}]`),
    ),
  );

  for (const [interviewerId, intervals] of entries.slice(1)) {
    const normalized = mergeNumericIntervals(
      intervals.map((interval, index) =>
        toNumericInterval(interval, `${interviewerId}[${index}]`),
      ),
    );

    common = intersectTwoSets(common, normalized);

    if (common.length === 0) {
      break;
    }
  }

  return common.map(toTimeInterval);
}

export function calculateAvailableSlots(
  input: AvailabilityInput,
): AvailableSlot[] {
  requirePositiveInteger(input.durationMinutes, "durationMinutes");

  const bufferBeforeMinutes = input.bufferBeforeMinutes ?? 0;
  const bufferAfterMinutes = input.bufferAfterMinutes ?? 0;
  const minimumNoticeMinutes = input.minimumNoticeMinutes ?? 0;
  const bookingHorizonDays = input.bookingHorizonDays ?? 21;
  const slotStepMinutes = input.slotStepMinutes ?? input.durationMinutes;

  requireNonNegativeInteger(bufferBeforeMinutes, "bufferBeforeMinutes");
  requireNonNegativeInteger(bufferAfterMinutes, "bufferAfterMinutes");
  requireNonNegativeInteger(minimumNoticeMinutes, "minimumNoticeMinutes");
  requirePositiveInteger(bookingHorizonDays, "bookingHorizonDays");
  requirePositiveInteger(slotStepMinutes, "slotStepMinutes");

  const interviewerIds = Object.keys(input.interviewerAvailability);

  if (interviewerIds.length === 0) {
    return [];
  }

  const now = input.now
    ? parseTimestamp(input.now, "now")
    : Date.now();

  const earliestStart = now + minimumNoticeMinutes * MINUTE_MS;
  const latestEnd = now + bookingHorizonDays * DAY_MS;
  const durationMs = input.durationMinutes * MINUTE_MS;
  const stepMs = slotStepMinutes * MINUTE_MS;
  const bufferBeforeMs = bufferBeforeMinutes * MINUTE_MS;
  const bufferAfterMs = bufferAfterMinutes * MINUTE_MS;

  const commonAvailability = intersectAvailability(
    input.interviewerAvailability,
  ).map((interval, index) =>
    toNumericInterval(interval, `commonAvailability[${index}]`),
  );

  const conflicts = [
    ...(input.busyTimes ?? []),
    ...(input.existingBookings ?? []),
  ].map((interval, index) => {
    const conflict = toNumericInterval(interval, `conflicts[${index}]`);

    return {
      start: conflict.start - bufferAfterMs,
      end: conflict.end + bufferBeforeMs,
    };
  });

  const openIntervals = subtractIntervals(
    commonAvailability,
    mergeNumericIntervals(conflicts),
  );

  const slots: AvailableSlot[] = [];

  for (const interval of openIntervals) {
    const boundedStart = Math.max(interval.start, earliestStart);
    const boundedEnd = Math.min(interval.end, latestEnd);

    if (boundedEnd - boundedStart < durationMs) {
      continue;
    }

    let slotStart = ceilToStep(boundedStart, stepMs);

    while (slotStart + durationMs <= boundedEnd) {
      slots.push({
        startsAt: new Date(slotStart).toISOString(),
        endsAt: new Date(slotStart + durationMs).toISOString(),
        durationMinutes: input.durationMinutes,
      });

      slotStart += stepMs;
    }
  }

  return slots;
}

export function slotIsStillAvailable(
  slot: TimeInterval,
  availableSlots: AvailableSlot[],
): boolean {
  const requested = toNumericInterval(slot, "slot");

  return availableSlots.some((available, index) => {
    const candidate = toNumericInterval(
      available,
      `availableSlots[${index}]`,
    );

    return (
      requested.start === candidate.start &&
      requested.end === candidate.end
    );
  });
}