import type {
  BookingRepository,
} from "./booking";
import type {
  BookingLifecycleRepository,
} from "./lifecycle";
import type {
  Booking,
  BookingParticipant,
  TimeInterval,
} from "./types";

export interface BookingQuery {
  organizationId: string;
  startsBefore?: string;
  endsAfter?: string;
  interviewTypeId?: string;
  participantId?: string;
  statuses?: Booking["status"][];
}

export interface HireMeBookingRepository
  extends BookingRepository,
    BookingLifecycleRepository {
  list(query: BookingQuery): Promise<Booking[]>;
}

function cloneParticipant(
  participant: BookingParticipant,
): BookingParticipant {
  return { ...participant };
}

function cloneBooking(booking: Booking): Booking {
  return {
    ...booking,
    candidate: {
      ...booking.candidate,
      answers: booking.candidate.answers
        ? { ...booking.candidate.answers }
        : undefined,
    },
    participants: booking.participants.map(
      cloneParticipant,
    ),
  };
}

function timestamp(
  value: string,
  field: string,
): number {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be a valid date-time`);
  }

  return parsed;
}

function intervalOf(
  booking: Booking,
): {
  start: number;
  end: number;
} {
  const start = timestamp(
    booking.startsAt,
    "booking.startsAt",
  );
  const end = timestamp(
    booking.endsAt,
    "booking.endsAt",
  );

  if (end <= start) {
    throw new Error(
      "booking.endsAt must be after booking.startsAt",
    );
  }

  return { start, end };
}

function participantsOf(
  booking: Booking,
): Set<string> {
  return new Set(
    booking.participants.map(
      (participant) => participant.userId,
    ),
  );
}

function sharesParticipant(
  left: Booking,
  right: Booking,
): boolean {
  const leftParticipants = participantsOf(left);

  return right.participants.some((participant) =>
    leftParticipants.has(participant.userId),
  );
}

function intervalsOverlap(
  left: Booking,
  right: Booking,
): boolean {
  const leftInterval = intervalOf(left);
  const rightInterval = intervalOf(right);

  return (
    leftInterval.start < rightInterval.end &&
    rightInterval.start < leftInterval.end
  );
}

function conflicts(
  candidate: Booking,
  existing: Booking,
): boolean {
  return (
    candidate.id !== existing.id &&
    candidate.organizationId ===
      existing.organizationId &&
    candidate.status === "confirmed" &&
    existing.status === "confirmed" &&
    sharesParticipant(candidate, existing) &&
    intervalsOverlap(candidate, existing)
  );
}

function matchesQuery(
  booking: Booking,
  query: BookingQuery,
): boolean {
  if (
    booking.organizationId !== query.organizationId
  ) {
    return false;
  }

  if (
    query.interviewTypeId &&
    booking.interviewTypeId !== query.interviewTypeId
  ) {
    return false;
  }

  if (
    query.participantId &&
    !booking.participants.some(
      (participant) =>
        participant.userId === query.participantId,
    )
  ) {
    return false;
  }

  if (
    query.statuses &&
    !query.statuses.includes(booking.status)
  ) {
    return false;
  }

  if (
    query.startsBefore &&
    timestamp(
      booking.startsAt,
      "booking.startsAt",
    ) >=
      timestamp(
        query.startsBefore,
        "query.startsBefore",
      )
  ) {
    return false;
  }

  if (
    query.endsAfter &&
    timestamp(
      booking.endsAt,
      "booking.endsAt",
    ) <=
      timestamp(query.endsAfter, "query.endsAfter")
  ) {
    return false;
  }

  return true;
}

export function bookingAsInterval(
  booking: Booking,
): TimeInterval {
  return {
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
  };
}

/**
 * Deterministic repository used by tests, local previews, and as the
 * behavioral reference for persistent adapters.
 *
 * Each mutating method performs all checks synchronously before its promise
 * resolves. Concurrent callers therefore cannot both claim the same slot in
 * one JavaScript process.
 */
export class MemoryHireMeBookingRepository
implements HireMeBookingRepository {
  private readonly bookings =
    new Map<string, Booking>();

  constructor(seed: Booking[] = []) {
    for (const booking of seed) {
      if (this.bookings.has(booking.id)) {
        throw new Error(
          `Duplicate booking id: ${booking.id}`,
        );
      }

      intervalOf(booking);
      this.bookings.set(
        booking.id,
        cloneBooking(booking),
      );
    }
  }

  async createIfSlotFree(
    booking: Booking,
  ): Promise<boolean> {
    intervalOf(booking);

    if (this.bookings.has(booking.id)) {
      return false;
    }

    for (const existing of this.bookings.values()) {
      if (conflicts(booking, existing)) {
        return false;
      }
    }

    this.bookings.set(
      booking.id,
      cloneBooking(booking),
    );

    return true;
  }

  async getById(
    id: string,
  ): Promise<Booking | null> {
    const booking = this.bookings.get(id);

    return booking ? cloneBooking(booking) : null;
  }

  async update(booking: Booking): Promise<void> {
    intervalOf(booking);

    if (!this.bookings.has(booking.id)) {
      throw new Error(
        `Booking not found: ${booking.id}`,
      );
    }

    for (const existing of this.bookings.values()) {
      if (conflicts(booking, existing)) {
        throw new Error(
          "Booking conflicts with an existing interview",
        );
      }
    }

    this.bookings.set(
      booking.id,
      cloneBooking(booking),
    );
  }

  async updateIfUnchanged(
    booking: Booking,
    expectedUpdatedAt: string,
  ): Promise<boolean> {
    intervalOf(booking);

    const current = this.bookings.get(booking.id);

    if (
      !current ||
      current.updatedAt !== expectedUpdatedAt
    ) {
      return false;
    }

    for (const existing of this.bookings.values()) {
      if (conflicts(booking, existing)) {
        return false;
      }
    }

    this.bookings.set(
      booking.id,
      cloneBooking(booking),
    );

    return true;
  }

  async list(
    query: BookingQuery,
  ): Promise<Booking[]> {
    return Array.from(this.bookings.values())
      .filter((booking) =>
        matchesQuery(booking, query),
      )
      .sort(
        (left, right) =>
          Date.parse(left.startsAt) -
            Date.parse(right.startsAt) ||
          left.id.localeCompare(right.id),
      )
      .map(cloneBooking);
  }
}