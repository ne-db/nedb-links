import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";

import type { Block, IdentityManifest } from "../lib/identity";
import { calculateAvailableSlots } from "../lib/hireme/availability";
import { expandAvailability } from "../lib/hireme/recurrence";
import type { AvailabilityRule } from "../lib/hireme/types";
import { authOf, requireUser } from "./auth";
import { config } from "./config";
import { db } from "./db";
import { hireMeBookingEmail } from "./emails";
import { hasRole } from "./grants";
import { getManifest } from "./identities";
import { sendMail } from "./mailer";
import { wrap } from "./util";

const BOOKINGS_COLLECTION = "hireme_bookings";
const activeIdentityClaims = new Set<string>();

interface PublicInterviewType {
  identityId: string;
  interviewTypeId: string;
  slug: string;
  title: string;
  description?: string;
  durationMinutes: number;
  locationLabel?: string;
  buttonLabel: string;
  confirmationTitle: string;
  confirmationMessage: string;
  timezone: string;
  availableDays: number[];
  availabilityStart: string;
  availabilityEnd: string;
  slotStepMinutes: number;
  bookingHorizonDays: number;
  minimumNoticeMinutes: number;
}

interface PublicSlot {
  startsAt: string;
  endsAt: string;
}

interface HireMeBookingDocument {
  id: string;
  identityId: string;
  interviewTypeId: string;
  slug: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  createdAt: string;
}

export const hireme = Router();

function text(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    return fallback;
  }

  return parsed;
}

function bookingDocumentId(
  identityId: string,
  slug: string,
  startsAt: string,
): string {
  return `hmb_${createHash("sha256")
    .update(`${identityId}\u0000${slug}\u0000${startsAt}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function blockToInterviewType(
  manifest: IdentityManifest,
  block: Block,
): PublicInterviewType | null {
  if (block.type !== "hireme") {
    return null;
  }

  const data = block.data;
  const slug = text(data.slug);

  if (!slug || data.active === false) {
    return null;
  }

  const availableDays =
    Array.isArray(data.availableDays) &&
    data.availableDays.length > 0
      ? Array.from(
          new Set(
            data.availableDays
              .map(Number)
              .filter(
                (day) =>
                  Number.isInteger(day) &&
                  day >= 0 &&
                  day <= 6,
              ),
          ),
        ).sort((left, right) => left - right)
      : [1, 2, 3, 4, 5];

  return {
    identityId: manifest.identityId,
    interviewTypeId:
      text(data.interviewTypeId) || block.id,
    slug,
    title: text(
      data.title,
      "Schedule an interview",
    ),
    description:
      text(data.description) || undefined,
    durationMinutes: integer(
      data.durationMinutes,
      30,
      5,
      480,
    ),
    locationLabel:
      text(data.locationLabel) || undefined,
    buttonLabel: text(
      data.buttonLabel,
      "Choose an interview time",
    ),
    confirmationTitle: text(
      data.confirmationTitle,
      "Your interview is confirmed",
    ),
    confirmationMessage: text(
      data.confirmationMessage,
      "You’re booked to speak with the hiring manager. We sent your interview details to the email address you provided.",
    ),
    timezone: text(data.timezone, "UTC"),
    availableDays,
    availabilityStart: text(
      data.availabilityStart,
      "09:00",
    ),
    availabilityEnd: text(
      data.availabilityEnd,
      "17:00",
    ),
    slotStepMinutes: integer(
      data.slotStepMinutes,
      30,
      5,
      120,
    ),
    bookingHorizonDays: integer(
      data.bookingHorizonDays,
      21,
      1,
      90,
    ),
    minimumNoticeMinutes: integer(
      data.minimumNoticeMinutes,
      720,
      0,
      43_200,
    ),
  };
}

async function resolveInterviewType(
  identityId: string,
  slug: string,
): Promise<PublicInterviewType | null> {
  const manifest = await getManifest(identityId);

  if (!manifest || manifest.status !== "published") {
    return null;
  }

  for (const block of manifest.blocks) {
    const interviewType = blockToInterviewType(
      manifest,
      block,
    );

    if (interviewType?.slug === slug) {
      return interviewType;
    }
  }

  return null;
}

function candidateSlots(
  interviewType: PublicInterviewType,
  now = Date.now(),
): PublicSlot[] {
  const rangeStart = new Date(now);
  const rangeEnd = new Date(
    now +
      interviewType.bookingHorizonDays *
        24 *
        60 *
        60_000,
  );

  const availabilityRule: AvailabilityRule = {
    id: `${interviewType.interviewTypeId}-weekly`,
    organizationId: interviewType.identityId,
    userId: interviewType.identityId,
    timezone: interviewType.timezone,
    daysOfWeek: interviewType.availableDays,
    startTime: interviewType.availabilityStart,
    endTime: interviewType.availabilityEnd,
    active: true,
  };

  const expanded = expandAvailability({
    rules: [availabilityRule],
    userIds: [interviewType.identityId],
    range: {
      startsAt: rangeStart.toISOString(),
      endsAt: rangeEnd.toISOString(),
    },
  });

  const slots = calculateAvailableSlots({
    interviewerAvailability: expanded,
    durationMinutes: interviewType.durationMinutes,
    minimumNoticeMinutes:
      interviewType.minimumNoticeMinutes,
    bookingHorizonDays:
      interviewType.bookingHorizonDays,
    slotStepMinutes:
      interviewType.slotStepMinutes,
    now: rangeStart.toISOString(),
  });

  return slots.map((slot) => ({
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  }));
}
async function confirmedBookingsForIdentity(
  identityId: string,
): Promise<HireMeBookingDocument[]> {
  const rows = (await db.query(
    `FROM ${BOOKINGS_COLLECTION} WHERE identityId = ${JSON.stringify(
      identityId,
    )} LIMIT 1000`,
  )) as unknown as HireMeBookingDocument[];

  return rows.filter(
    (booking) =>
      booking.identityId === identityId &&
      booking.status === "confirmed",
  );
}

function slotOverlapsBooking(
  slot: PublicSlot,
  booking: HireMeBookingDocument,
): boolean {
  const slotStart = Date.parse(slot.startsAt);
  const slotEnd = Date.parse(slot.endsAt);
  const bookingStart = Date.parse(booking.startsAt);
  const bookingEnd = Date.parse(booking.endsAt);

  return (
    slotStart < bookingEnd &&
    bookingStart < slotEnd
  );
}

async function availableSlots(
  interviewType: PublicInterviewType,
): Promise<PublicSlot[]> {
  const slots = candidateSlots(interviewType);
  const confirmedBookings =
    await confirmedBookingsForIdentity(
      interviewType.identityId,
    );

  return slots.filter(
    (slot) =>
      !confirmedBookings.some((booking) =>
        slotOverlapsBooking(slot, booking),
      ),
  );
}

function validEmail(value: string): boolean {
  return (
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function hireMeCsvCell(value: unknown): string {
  let textValue = String(value ?? "");

  // Stop spreadsheet applications from evaluating candidate input.
  if (/^[=+\-@\t\r]/.test(textValue)) {
    textValue = `'${textValue}`;
  }

  return `"${textValue.replaceAll('"', '""')}"`;
}

async function allBookingsForIdentity(
  identityId: string,
): Promise<HireMeBookingDocument[]> {
  const rows = (await db.query(
    `FROM ${BOOKINGS_COLLECTION} WHERE identityId = ${JSON.stringify(
      identityId,
    )} LIMIT 10000`,
  )) as unknown as HireMeBookingDocument[];

  return rows.filter(
    (booking) => booking.identityId === identityId,
  );
}

hireme.get(
  "/identities/:identityId/bookings",
  requireUser,
  wrap(async (req, res) => {
    const identityId = String(req.params.identityId);
    const auth = authOf(res);

    if (
      !auth ||
      !(await hasRole(identityId, auth, "viewer"))
    ) {
      res.status(403).json({
        error:
          "You do not have access to this identity’s interviews.",
      });
      return;
    }

    const bookings = (
      await allBookingsForIdentity(identityId)
    ).sort(
      (left, right) =>
        Date.parse(left.startsAt) -
        Date.parse(right.startsAt),
    );
    const now = Date.now();

    res.json({
      upcoming: bookings.filter(
        (booking) =>
          booking.status === "confirmed" &&
          Date.parse(booking.endsAt) >= now,
      ),
      past: bookings.filter(
        (booking) =>
          booking.status !== "confirmed" ||
          Date.parse(booking.endsAt) < now,
      ),
    });
  }),
);

hireme.get(
  "/identities/:identityId/leads.csv",
  requireUser,
  wrap(async (req, res) => {
    const identityId = String(req.params.identityId);
    const interviewTypeId =
      typeof req.query.interviewTypeId === "string"
        ? req.query.interviewTypeId.trim()
        : "";
    const auth = authOf(res);

    if (
      !auth ||
      !(await hasRole(identityId, auth, "viewer"))
    ) {
      res.status(403).json({
        error:
          "You do not have access to these candidate leads.",
      });
      return;
    }

    const bookings = (
      await allBookingsForIdentity(identityId)
    )
      .filter(
        (booking) =>
          !interviewTypeId ||
          booking.interviewTypeId === interviewTypeId,
      )
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) -
          Date.parse(left.createdAt),
      );

    const rows: unknown[][] = [
      [
        "candidate_name",
        "candidate_email",
        "candidate_phone",
        "interview_type_id",
        "booking_slug",
        "starts_at",
        "ends_at",
        "status",
        "submitted_at",
        "booking_id",
      ],
      ...bookings.map((booking) => [
        booking.candidateName,
        booking.candidateEmail,
        booking.candidatePhone ?? "",
        booking.interviewTypeId,
        booking.slug,
        booking.startsAt,
        booking.endsAt,
        booking.status,
        booking.createdAt,
        booking.id,
      ]),
    ];

    const csv = rows
      .map((row) =>
        row.map(hireMeCsvCell).join(","),
      )
      .join("\r\n");
    const safeName = (
      interviewTypeId || "all"
    ).replace(/[^a-zA-Z0-9_-]+/g, "-");

    res
      .status(200)
      .set({
        "content-type":
          "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="hireme-${safeName}-leads.csv"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      })
      .send(`\uFEFF${csv}\r\n`);
  }),
);

hireme.patch(
  "/identities/:identityId/bookings/:bookingId",
  requireUser,
  wrap(async (req, res) => {
    const identityId = String(req.params.identityId);
    const bookingId = String(req.params.bookingId);
    const requestedStatus = String(
      req.body?.status ?? "",
    );
    const auth = authOf(res);

    if (
      !auth ||
      !(await hasRole(identityId, auth, "editor"))
    ) {
      res.status(403).json({
        error:
          "You do not have permission to manage these interviews.",
      });
      return;
    }

    if (
      requestedStatus !== "cancelled" &&
      requestedStatus !== "completed" &&
      requestedStatus !== "no_show"
    ) {
      res.status(400).json({
        error:
          "Status must be cancelled, completed, or no_show.",
      });
      return;
    }

    const bookings =
      await allBookingsForIdentity(identityId);
    const booking = bookings.find(
      (candidate) =>
        candidate.identityId === identityId &&
        candidate.id === bookingId,
    );

    if (!booking) {
      res.status(404).json({
        error: "Interview not found.",
      });
      return;
    }

    if (booking.status !== "confirmed") {
      res.status(409).json({
        error:
          "Only confirmed interviews can be updated.",
      });
      return;
    }

    const status = requestedStatus as
      | "cancelled"
      | "completed"
      | "no_show";

    const updated: HireMeBookingDocument = {
      ...booking,
      status,
    };

    await db.put(
      BOOKINGS_COLLECTION,
      bookingDocumentId(
        booking.identityId,
        booking.slug,
        booking.startsAt,
      ),
      updated,
    );

    res.status(200).json({
      booking: updated,
    });
  }),
);

hireme.get(
  "/identities/:identityId/bookings/:bookingId/calendar.ics",
  requireUser,
  wrap(async (req, res) => {
    const identityId = String(req.params.identityId);
    const bookingId = String(req.params.bookingId);
    const auth = authOf(res);

    if (
      !auth ||
      !(await hasRole(identityId, auth, "viewer"))
    ) {
      res.status(403).json({
        error:
          "You do not have access to this interview.",
      });
      return;
    }

    const bookings =
      await allBookingsForIdentity(identityId);
    const booking = bookings.find(
      (candidate) =>
        candidate.identityId === identityId &&
        candidate.id === bookingId,
    );

    if (!booking) {
      res.status(404).json({
        error: "Interview not found.",
      });
      return;
    }

    const escapeIcsText = (value: string): string =>
      value
        .replaceAll("\\", "\\\\")
        .replaceAll("\r\n", "\\n")
        .replaceAll("\n", "\\n")
        .replaceAll(",", "\\,")
        .replaceAll(";", "\\;");

    const formatIcsDate = (value: string): string =>
      new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    const description = [
      `Candidate: ${booking.candidateName}`,
      `Email: ${booking.candidateEmail}`,
      booking.candidatePhone
        ? `Phone: ${booking.candidatePhone}`
        : "",
      `Interview type: ${booking.interviewTypeId}`,
    ]
      .filter(Boolean)
      .join("\n");

    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//OurLynx//HireMe//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(
        booking.id,
      )}@hireme.ourlynx`,
      `DTSTAMP:${formatIcsDate(
        new Date().toISOString(),
      )}`,
      `DTSTART:${formatIcsDate(booking.startsAt)}`,
      `DTEND:${formatIcsDate(booking.endsAt)}`,
      `SUMMARY:${escapeIcsText(
        `Interview with ${booking.candidateName}`,
      )}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `STATUS:${
        booking.status === "cancelled"
          ? "CANCELLED"
          : "CONFIRMED"
      }`,
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    res
      .status(200)
      .set({
        "content-type":
          "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="hireme-${booking.id}.ics"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      })
      .send(calendar);
  }),
);
hireme.get(
  "/types/:identityId/:slug",
  wrap(async (req, res) => {
    const identityId = String(
      req.params.identityId,
    );
    const slug = String(req.params.slug);
    const interviewType =
      await resolveInterviewType(
        identityId,
        slug,
      );

    if (!interviewType) {
      res.status(404).json({
        error:
          "This interview link is unavailable.",
      });
      return;
    }

    res.json({ interviewType });
  }),
);

hireme.get(
  "/types/:identityId/:slug/slots",
  wrap(async (req, res) => {
    const identityId = String(
      req.params.identityId,
    );
    const slug = String(req.params.slug);
    const interviewType =
      await resolveInterviewType(
        identityId,
        slug,
      );

    if (!interviewType) {
      res.status(404).json({
        error:
          "This interview link is unavailable.",
      });
      return;
    }

    res.json({
      slots: await availableSlots(
        interviewType,
      ),
    });
  }),
);

hireme.post(
  "/types/:identityId/:slug/bookings",
  wrap(async (req, res) => {
    const identityId = String(
      req.params.identityId,
    );
    const slug = String(req.params.slug);
    const interviewType =
      await resolveInterviewType(
        identityId,
        slug,
      );

    if (!interviewType) {
      res.status(404).json({
        error:
          "This interview link is unavailable.",
      });
      return;
    }

    const candidateName = text(
      req.body?.name,
    );
    const candidateEmail = text(
      req.body?.email,
    ).toLowerCase();
    const candidatePhone =
      text(req.body?.phone) || undefined;
    const requestedStart = text(
      req.body?.startsAt,
    );

    if (
      !candidateName ||
      candidateName.length > 200 ||
      !validEmail(candidateEmail)
    ) {
      res.status(400).json({
        error:
          "Enter your name and a valid email address.",
      });
      return;
    }

    if (
      candidatePhone &&
      candidatePhone.length > 50
    ) {
      res.status(400).json({
        error: "Phone number is too long.",
      });
      return;
    }

    const slots = await availableSlots(
      interviewType,
    );
    const slot = slots.find(
      (candidate) =>
        candidate.startsAt === requestedStart,
    );

    if (!slot) {
      res.status(409).json({
        error:
          "That time was just booked. Choose another available time.",
      });
      return;
    }

    const documentId = bookingDocumentId(
      identityId,
      slug,
      slot.startsAt,
    );

    const claimKey = identityId;

    if (activeIdentityClaims.has(claimKey)) {
      res.status(409).json({
        error:
          "That time was just booked. Choose another available time.",
      });
      return;
    }

    activeIdentityClaims.add(claimKey);

    try {
      const freshSlots = await availableSlots(
        interviewType,
      );
      const slotIsStillAvailable = freshSlots.some(
        (candidate) =>
          candidate.startsAt === slot.startsAt &&
          candidate.endsAt === slot.endsAt,
      );

      if (!slotIsStillAvailable) {
        res.status(409).json({
          error:
            "That time overlaps another interview. Choose another available time.",
        });
        return;
      }
      const existing = await db.get(
        BOOKINGS_COLLECTION,
        documentId,
      );

      if (
        existing &&
        existing.status !== "cancelled"
      ) {
        res.status(409).json({
          error:
            "That time was just booked. Choose another available time.",
        });
        return;
      }

      const booking: HireMeBookingDocument = {
        id: randomUUID(),
        identityId,
        interviewTypeId:
          interviewType.interviewTypeId,
        slug,
        candidateName,
        candidateEmail,
        candidatePhone,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: "confirmed",
        createdAt: new Date().toISOString(),
      };

      await db.put(
        BOOKINGS_COLLECTION,
        documentId,
        booking,
      );

      const notificationBase = {
        title: interviewType.title,
        candidateName: booking.candidateName,
        candidateEmail: booking.candidateEmail,
        candidatePhone: booking.candidatePhone,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        timezone: interviewType.timezone,
        locationLabel: interviewType.locationLabel,
      };

      // The booking is already durable. Notification failure must never
      // make a successfully claimed slot look failed to the candidate.
      void sendMail(
        hireMeBookingEmail({
          ...notificationBase,
          to: booking.candidateEmail,
          recipient: "candidate",
        }),
      ).catch((err) =>
        console.warn(
          `[links] HireMe candidate confirmation failed: ${
            err instanceof Error ? err.message : err
          }`,
        ),
      );

      if (config.adminEmail) {
        void sendMail(
          hireMeBookingEmail({
            ...notificationBase,
            to: config.adminEmail,
            recipient: "admin",
          }),
        ).catch((err) =>
          console.warn(
            `[links] HireMe admin notification failed: ${
              err instanceof Error ? err.message : err
            }`,
          ),
        );
      }

      res.status(201).json({
        booking: {
          id: booking.id,
          title: interviewType.title,
          confirmationTitle:
            interviewType.confirmationTitle,
          confirmationMessage:
            interviewType.confirmationMessage,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          locationLabel:
            interviewType.locationLabel,
          candidateName:
            booking.candidateName,
          candidateEmail:
            booking.candidateEmail,
          status: booking.status,
        },
      });
    } finally {
      activeIdentityClaims.delete(claimKey);
    }
  }),
);