export type IsoDateTime = string;

export interface TimeInterval {
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
}

export interface AvailabilityRule {
  id: string;
  organizationId: string;
  userId: string;
  timezone: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  active: boolean;
}

export interface AvailabilityOverride {
  id: string;
  organizationId: string;
  userId: string;
  date: string;
  timezone: string;
  available: boolean;
  intervals: TimeInterval[];
  reason?: string;
}

export type InterviewLocationType =
  | "video"
  | "phone"
  | "in_person";

export interface InterviewType {
  id: string;
  organizationId: string;
  ownerId: string;
  slug: string;
  title: string;
  description?: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minimumNoticeMinutes: number;
  bookingHorizonDays: number;
  timezone: string;
  interviewerIds: string[];
  jobId?: string;
  locationType: InterviewLocationType;
  location?: string;
  instructions?: string;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export interface BookingParticipant {
  userId: string;
  role: "host" | "interviewer";
}

export interface CandidateDetails {
  name: string;
  email: string;
  phone?: string;
  timezone?: string;
  answers?: Record<string, string>;
}

export interface Booking {
  id: string;
  organizationId: string;
  interviewTypeId: string;
  candidateId?: string;
  jobId?: string;
  candidate: CandidateDetails;
  participants: BookingParticipant[];
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  timezone: string;
  status: BookingStatus;
  locationType: InterviewLocationType;
  location?: string;
  cancellationTokenHash?: string;
  rescheduleTokenHash?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CalendarEventReference {
  provider: string;
  connectionId: string;
  externalEventId: string;
}

export interface CalendarConnection {
  id: string;
  organizationId: string;
  userId: string;
  provider: string;
  calendarId: string;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CalendarProvider {
  getBusyTimes(
    connection: CalendarConnection,
    range: TimeInterval,
  ): Promise<TimeInterval[]>;

  createEvent(
    connection: CalendarConnection,
    booking: Booking,
  ): Promise<CalendarEventReference>;

  updateEvent(
    connection: CalendarConnection,
    reference: CalendarEventReference,
    booking: Booking,
  ): Promise<void>;

  deleteEvent(
    connection: CalendarConnection,
    reference: CalendarEventReference,
  ): Promise<void>;
}

export interface AvailabilityInput {
  interviewerAvailability: Record<string, TimeInterval[]>;
  busyTimes?: TimeInterval[];
  existingBookings?: TimeInterval[];
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minimumNoticeMinutes?: number;
  bookingHorizonDays?: number;
  slotStepMinutes?: number;
  now?: IsoDateTime;
}

export interface AvailableSlot extends TimeInterval {
  durationMinutes: number;
}