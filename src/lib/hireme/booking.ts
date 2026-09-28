import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { slotIsStillAvailable } from "./availability";
import type {
  AvailableSlot,
  Booking,
  CandidateDetails,
  InterviewType,
  TimeInterval,
} from "./types";

export interface CreateBookingInput {
  organizationId: string;
  interviewType: InterviewType;
  candidateId?: string;
  candidate: CandidateDetails;
  slot: TimeInterval;
  availableSlots: AvailableSlot[];
}

export interface BookingTokens {
  cancellationToken: string;
  rescheduleToken: string;
}

export interface CreateBookingResult {
  booking: Booking;
  tokens: BookingTokens;
}

export interface BookingRepository {
  /**
   * This operation must atomically verify that no confirmed booking overlaps
   * the requested slot for any participant, then persist the booking.
   *
   * It returns false when another request claimed the slot first.
   */
  createIfSlotFree(booking: Booking): Promise<boolean>;

  getById(id: string): Promise<Booking | null>;

  update(booking: Booking): Promise<void>;
}

export interface BookingFactoryOptions {
  now?: () => Date;
  id?: () => string;
  token?: () => string;
}

export class BookingValidationError extends Error {
  readonly code:
    | "invalid_candidate"
    | "invalid_slot"
    | "slot_unavailable"
    | "interview_type_inactive";

  constructor(
    code: BookingValidationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "BookingValidationError";
    this.code = code;
  }
}

export class BookingConflictError extends Error {
  readonly code = "slot_taken";

  constructor(message = "This interview slot is no longer available") {
    super(message);
    this.name = "BookingConflictError";
  }
}

function cleanRequiredText(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new BookingValidationError(
      "invalid_candidate",
      `${field} is required`,
    );
  }

  const cleaned = value.trim();

  if (cleaned.length === 0) {
    throw new BookingValidationError(
      "invalid_candidate",
      `${field} is required`,
    );
  }

  if (cleaned.length > maximumLength) {
    throw new BookingValidationError(
      "invalid_candidate",
      `${field} is too long`,
    );
  }

  return cleaned;
}

function cleanOptionalText(
  value: unknown,
  field: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new BookingValidationError(
      "invalid_candidate",
      `${field} must be text`,
    );
  }

  const cleaned = value.trim();

  if (cleaned.length > maximumLength) {
    throw new BookingValidationError(
      "invalid_candidate",
      `${field} is too long`,
    );
  }

  return cleaned || undefined;
}

function normalizeEmail(value: unknown): string {
  const email = cleanRequiredText(value, "email", 320).toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    throw new BookingValidationError(
      "invalid_candidate",
      "email must be valid",
    );
  }

  return email;
}

function normalizeAnswers(
  answers: unknown,
): Record<string, string> | undefined {
  if (answers === undefined) {
    return undefined;
  }

  if (
    answers === null ||
    typeof answers !== "object" ||
    Array.isArray(answers)
  ) {
    throw new BookingValidationError(
      "invalid_candidate",
      "answers must be an object",
    );
  }

  const entries = Object.entries(answers);

  if (entries.length > 20) {
    throw new BookingValidationError(
      "invalid_candidate",
      "answers cannot contain more than 20 responses",
    );
  }

  const normalized: Record<string, string> = {};

  for (const [rawKey, rawValue] of entries) {
    const key = cleanRequiredText(rawKey, "answer key", 100);
    const value = cleanRequiredText(
      rawValue,
      `answer ${key}`,
      2_000,
    );

    normalized[key] = value;
  }

  return normalized;
}

export function normalizeCandidate(
  candidate: CandidateDetails,
): CandidateDetails {
  return {
    name: cleanRequiredText(candidate.name, "name", 200),
    email: normalizeEmail(candidate.email),
    phone: cleanOptionalText(candidate.phone, "phone", 50),
    timezone: cleanOptionalText(
      candidate.timezone,
      "timezone",
      100,
    ),
    answers: normalizeAnswers(candidate.answers),
  };
}

function parseSlot(
  slot: TimeInterval,
): { startsAt: string; endsAt: string; durationMinutes: number } {
  const startsAtMs = Date.parse(slot.startsAt);
  const endsAtMs = Date.parse(slot.endsAt);

  if (
    !Number.isFinite(startsAtMs) ||
    !Number.isFinite(endsAtMs) ||
    endsAtMs <= startsAtMs
  ) {
    throw new BookingValidationError(
      "invalid_slot",
      "slot must contain valid start and end times",
    );
  }

  const durationMs = endsAtMs - startsAtMs;

  if (durationMs % 60_000 !== 0) {
    throw new BookingValidationError(
      "invalid_slot",
      "slot duration must use whole minutes",
    );
  }

  return {
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    durationMinutes: durationMs / 60_000,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function defaultToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createBooking(
  repository: BookingRepository,
  input: CreateBookingInput,
  options: BookingFactoryOptions = {},
): Promise<CreateBookingResult> {
  if (!input.interviewType.active) {
    throw new BookingValidationError(
      "interview_type_inactive",
      "This interview type is not accepting bookings",
    );
  }

  if (
    input.organizationId !== input.interviewType.organizationId
  ) {
    throw new BookingValidationError(
      "invalid_slot",
      "Interview type does not belong to this organization",
    );
  }

  const parsedSlot = parseSlot(input.slot);

  if (
    parsedSlot.durationMinutes !==
    input.interviewType.durationMinutes
  ) {
    throw new BookingValidationError(
      "invalid_slot",
      "Slot duration does not match the interview type",
    );
  }

  const normalizedSlot: TimeInterval = {
    startsAt: parsedSlot.startsAt,
    endsAt: parsedSlot.endsAt,
  };

  if (
    !slotIsStillAvailable(
      normalizedSlot,
      input.availableSlots,
    )
  ) {
    throw new BookingValidationError(
      "slot_unavailable",
      "This interview slot is not available",
    );
  }

  const candidate = normalizeCandidate(input.candidate);
  const makeToken = options.token ?? defaultToken;
  const cancellationToken = makeToken();
  const rescheduleToken = makeToken();

  if (
    !cancellationToken ||
    !rescheduleToken ||
    cancellationToken === rescheduleToken
  ) {
    throw new Error("Booking token generator returned invalid tokens");
  }

  const now = (options.now ?? (() => new Date()))().toISOString();
  const interviewerIds = Array.from(
    new Set([
      input.interviewType.ownerId,
      ...input.interviewType.interviewerIds,
    ]),
  );

  const booking: Booking = {
    id: (options.id ?? randomUUID)(),
    organizationId: input.organizationId,
    interviewTypeId: input.interviewType.id,
    candidateId: input.candidateId,
    jobId: input.interviewType.jobId,
    candidate,
    participants: interviewerIds.map((userId, index) => ({
      userId,
      role: index === 0 ? "host" : "interviewer",
    })),
    startsAt: parsedSlot.startsAt,
    endsAt: parsedSlot.endsAt,
    timezone: input.interviewType.timezone,
    status: "confirmed",
    locationType: input.interviewType.locationType,
    location: input.interviewType.location,
    cancellationTokenHash: hashToken(cancellationToken),
    rescheduleTokenHash: hashToken(rescheduleToken),
    createdAt: now,
    updatedAt: now,
  };

  const created = await repository.createIfSlotFree(booking);

  if (!created) {
    throw new BookingConflictError();
  }

  return {
    booking,
    tokens: {
      cancellationToken,
      rescheduleToken,
    },
  };
}

export function tokenMatches(
  token: string,
  expectedHash: string | undefined,
): boolean {
  if (!token || !expectedHash) {
    return false;
  }

  return hashToken(token) === expectedHash;
}