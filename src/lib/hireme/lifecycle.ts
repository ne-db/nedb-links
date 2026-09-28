import {
  createHash,
  randomBytes,
} from "node:crypto";

import { slotIsStillAvailable } from "./availability";
import { tokenMatches } from "./booking";
import type {
  AvailableSlot,
  Booking,
  TimeInterval,
} from "./types";

export interface BookingLifecycleRepository {
  getById(id: string): Promise<Booking | null>;

  /**
   * Persist only when the stored booking still has expectedUpdatedAt.
   * This prevents cancellation and rescheduling requests from overwriting
   * each other.
   */
  updateIfUnchanged(
    booking: Booking,
    expectedUpdatedAt: string,
  ): Promise<boolean>;
}

export interface BookingLifecycleOptions {
  now?: () => Date;
  token?: () => string;
}

export interface RescheduleBookingInput {
  bookingId: string;
  token: string;
  slot: TimeInterval;
  availableSlots: AvailableSlot[];
}

export interface RescheduleBookingResult {
  booking: Booking;
  cancellationToken: string;
  rescheduleToken: string;
}

export type BookingLifecycleErrorCode =
  | "booking_not_found"
  | "invalid_token"
  | "booking_not_active"
  | "invalid_slot"
  | "slot_unavailable"
  | "booking_changed";

export class BookingLifecycleError extends Error {
  readonly code: BookingLifecycleErrorCode;

  constructor(
    code: BookingLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BookingLifecycleError";
    this.code = code;
  }
}

function defaultToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeSlot(
  slot: TimeInterval,
): {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
} {
  const startsAt = Date.parse(slot.startsAt);
  const endsAt = Date.parse(slot.endsAt);

  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt
  ) {
    throw new BookingLifecycleError(
      "invalid_slot",
      "The requested slot is invalid",
    );
  }

  const durationMs = endsAt - startsAt;

  if (durationMs % 60_000 !== 0) {
    throw new BookingLifecycleError(
      "invalid_slot",
      "Slot duration must use whole minutes",
    );
  }

  return {
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    durationMinutes: durationMs / 60_000,
  };
}

function bookingDurationMinutes(booking: Booking): number {
  return (
    (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) /
    60_000
  );
}

function requireToken(
  token: string,
  expectedHash: string | undefined,
): void {
  if (!tokenMatches(token, expectedHash)) {
    throw new BookingLifecycleError(
      "invalid_token",
      "This booking link is invalid or has expired",
    );
  }
}

function requireActiveBooking(booking: Booking): void {
  if (booking.status !== "confirmed") {
    throw new BookingLifecycleError(
      "booking_not_active",
      "This booking can no longer be changed",
    );
  }
}

async function loadBooking(
  repository: BookingLifecycleRepository,
  bookingId: string,
): Promise<Booking> {
  const booking = await repository.getById(bookingId);

  if (!booking) {
    throw new BookingLifecycleError(
      "booking_not_found",
      "Booking not found",
    );
  }

  return booking;
}

function makeDistinctTokens(
  createToken: () => string,
): {
  cancellationToken: string;
  rescheduleToken: string;
} {
  const cancellationToken = createToken();
  const rescheduleToken = createToken();

  if (
    !cancellationToken ||
    !rescheduleToken ||
    cancellationToken === rescheduleToken
  ) {
    throw new Error(
      "Booking lifecycle token generator returned invalid tokens",
    );
  }

  return {
    cancellationToken,
    rescheduleToken,
  };
}

export async function cancelBooking(
  repository: BookingLifecycleRepository,
  bookingId: string,
  token: string,
  options: BookingLifecycleOptions = {},
): Promise<Booking> {
  const booking = await loadBooking(repository, bookingId);

  requireToken(token, booking.cancellationTokenHash);
  requireActiveBooking(booking);

  const expectedUpdatedAt = booking.updatedAt;
  const updated: Booking = {
    ...booking,
    status: "cancelled",
    cancellationTokenHash: undefined,
    rescheduleTokenHash: undefined,
    updatedAt: (options.now ?? (() => new Date()))().toISOString(),
  };

  const saved = await repository.updateIfUnchanged(
    updated,
    expectedUpdatedAt,
  );

  if (!saved) {
    throw new BookingLifecycleError(
      "booking_changed",
      "This booking changed while the request was being processed",
    );
  }

  return updated;
}

export async function rescheduleBooking(
  repository: BookingLifecycleRepository,
  input: RescheduleBookingInput,
  options: BookingLifecycleOptions = {},
): Promise<RescheduleBookingResult> {
  const booking = await loadBooking(
    repository,
    input.bookingId,
  );

  requireToken(input.token, booking.rescheduleTokenHash);
  requireActiveBooking(booking);

  const slot = normalizeSlot(input.slot);

  if (
    slot.durationMinutes !== bookingDurationMinutes(booking)
  ) {
    throw new BookingLifecycleError(
      "invalid_slot",
      "The new slot must have the same duration",
    );
  }

  const normalizedSlot: TimeInterval = {
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  };

  if (
    !slotIsStillAvailable(
      normalizedSlot,
      input.availableSlots,
    )
  ) {
    throw new BookingLifecycleError(
      "slot_unavailable",
      "This interview slot is no longer available",
    );
  }

  const tokens = makeDistinctTokens(
    options.token ?? defaultToken,
  );
  const expectedUpdatedAt = booking.updatedAt;
  const updated: Booking = {
    ...booking,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    cancellationTokenHash: hashToken(
      tokens.cancellationToken,
    ),
    rescheduleTokenHash: hashToken(
      tokens.rescheduleToken,
    ),
    updatedAt: (options.now ?? (() => new Date()))().toISOString(),
  };

  const saved = await repository.updateIfUnchanged(
    updated,
    expectedUpdatedAt,
  );

  if (!saved) {
    throw new BookingLifecycleError(
      "booking_changed",
      "This booking changed while the request was being processed",
    );
  }

  return {
    booking: updated,
    ...tokens,
  };
}