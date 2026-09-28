import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "@interchained/portal-react";

import { Gate } from "../../src/components/Gate";
import { Nav } from "../../src/components/Nav";
import {
  ApiError,
  adminHeaders,
  getJson,
  getToken,
} from "../../src/lib/api";

interface ManagerBooking {
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

interface BookingResponse {
  upcoming: ManagerBooking[];
  past: ManagerBooking[];
}

function identityFromPath(): string {
  const parts = window.location.pathname
    .split("/")
    .filter(Boolean);

  return decodeURIComponent(parts[1] ?? "");
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function BookingCard({
  booking,
  identityId,
  onUpdated,
}: {
  booking: ManagerBooking;
  identityId: string;
  onUpdated: () => Promise<void>;
}): React.ReactElement {
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState("");

  async function updateStatus(
    status: "cancelled" | "completed" | "no_show",
  ): Promise<void> {
    const labels = {
      cancelled: "cancel this interview",
      completed: "mark this interview completed",
      no_show: "mark this candidate as a no-show",
    };

    if (
      !window.confirm(
        `Are you sure you want to ${labels[status]}?`,
      )
    ) {
      return;
    }

    setUpdating(true);
    setActionError("");

    try {
      const response = await fetch(
        `/api/hireme/identities/${encodeURIComponent(
          identityId,
        )}/bookings/${encodeURIComponent(booking.id)}`,
        {
          method: "PATCH",
          headers: {
            ...adminHeaders(),
            "content-type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      );
      const contentType =
        response.headers.get("content-type") ?? "";
      const payload = contentType.includes(
        "application/json",
      )
        ? ((await response.json()) as {
            error?: string;
          })
        : {
            error: response.ok
              ? undefined
              : "The interview service returned an invalid response.",
          };

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "The interview could not be updated.",
        );
      }

      await onUpdated();
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "The interview could not be updated.",
      );
    } finally {
      setUpdating(false);
    }
  }
  async function openSystemCalendar(): Promise<void> {
    setActionError("");

    try {
      const response = await fetch(
        `/api/hireme/identities/${encodeURIComponent(
          identityId,
        )}/bookings/${encodeURIComponent(
          booking.id,
        )}/calendar.ics`,
        {
          headers: adminHeaders(),
        },
      );

      if (!response.ok) {
        const contentType =
          response.headers.get("content-type") ?? "";
        const payload = contentType.includes(
          "application/json",
        )
          ? ((await response.json()) as {
              error?: string;
            })
          : {};

        throw new Error(
          payload.error ||
            "The calendar event could not be created.",
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `hireme-${booking.id}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        1_000,
      );
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "The calendar event could not be created.",
      );
    }
  }

  const googleCalendarUrl = (() => {
    const calendarDate = (value: string): string =>
      new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");

    const parameters = new URLSearchParams({
      action: "TEMPLATE",
      text: `Interview with ${booking.candidateName}`,
      dates: `${calendarDate(
        booking.startsAt,
      )}/${calendarDate(booking.endsAt)}`,
      details: [
        `Candidate: ${booking.candidateName}`,
        `Email: ${booking.candidateEmail}`,
        booking.candidatePhone
          ? `Phone: ${booking.candidatePhone}`
          : "",
        `Interview type: ${booking.interviewTypeId}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return `https://calendar.google.com/calendar/render?${parameters.toString()}`;
  })();


  const statusLabels: Record<
    ManagerBooking["status"],
    string
  > = {
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
    no_show: "No-show",
  };

  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-fg">
              {booking.candidateName}
            </h3>

            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                booking.status === "confirmed"
                  ? "bg-emerald-500/15 text-emerald-700"
                  : booking.status === "completed"
                    ? "bg-blue-500/15 text-blue-700"
                    : "bg-red-500/15 text-red-700"
              }`}
            >
              {statusLabels[booking.status]}
            </span>
          </div>

          <p className="mt-2 font-medium text-fg">
            {formatDateTime(booking.startsAt)}
          </p>

          <p className="mt-1 text-sm text-fg-muted">
            {Math.round(
              (Date.parse(booking.endsAt) -
                Date.parse(booking.startsAt)) /
                60_000,
            )}{" "}
            minutes
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm sm:items-end">
          <a
            className="font-medium text-accent hover:underline"
            href={`mailto:${booking.candidateEmail}`}
          >
            {booking.candidateEmail}
          </a>

          {booking.candidatePhone ? (
            <a
              className="text-fg-muted hover:text-fg hover:underline"
              href={`tel:${booking.candidatePhone}`}
            >
              {booking.candidatePhone}
            </a>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-700"
        >
          {actionError}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => void openSystemCalendar()}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent"
        >
          Add to calendar
        </button>

        <a
          href={googleCalendarUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent"
        >
          Google Calendar
        </a>

        <a
          href={`mailto:${booking.candidateEmail}`}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent"
        >
          Email candidate
        </a>

        {booking.status === "confirmed" ? (
          <>
            <button
              type="button"
              disabled={updating}
              onClick={() =>
                void updateStatus("completed")
              }
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-emerald-500 disabled:opacity-50"
            >
              Complete
            </button>

            <button
              type="button"
              disabled={updating}
              onClick={() =>
                void updateStatus("no_show")
              }
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-amber-500 disabled:opacity-50"
            >
              No-show
            </button>

            <button
              type="button"
              disabled={updating}
              onClick={() =>
                void updateStatus("cancelled")
              }
              className="rounded-full border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-400/10 disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : null}
      </div>

      <div className="mt-3 text-xs text-fg-subtle">
        Interview type: {booking.interviewTypeId}
      </div>
    </article>
  );
}

function Inbox(): React.ReactElement {
  const identityId = useMemo(
    identityFromPath,
    [],
  );
  const [data, setData] =
    useState<BookingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(): Promise<void> {
    setLoading(true);
    setError("");

    try {
      setData(
        await getJson<BookingResponse>(
          `/api/hireme/identities/${encodeURIComponent(
            identityId,
          )}/bookings`,
        ),
      );
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.status === 403
      ) {
        setError(
          "You do not have access to this identity’s interviews.",
        );
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "Interviews could not be loaded.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [identityId]);

  return (
    <>
      <Nav />

      <main className="mx-auto min-h-[calc(100vh-64px)] max-w-5xl px-5 py-10 text-fg">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="kicker">
              HireMe by OurLynx
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Interview inbox
            </h1>
            <p className="mt-2 max-w-2xl text-fg-muted">
              Review upcoming interviews and contact
              candidates directly.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/edit/${encodeURIComponent(
                identityId,
              )}`}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-accent"
            >
              Edit profile
            </Link>

            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </header>

        {error ? (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-7 rounded-2xl border border-line bg-surface p-6 text-fg-muted">
            Loading interviews…
          </div>
        ) : data ? (
          <div className="mt-8 space-y-10">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  Upcoming
                </h2>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                  {data.upcoming.length}
                </span>
              </div>

              <div className="space-y-3">
                {data.upcoming.length ? (
                  data.upcoming.map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      identityId={identityId}
                      onUpdated={load}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-line p-7 text-center text-fg-muted">
                    No upcoming interviews.
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  Past and cancelled
                </h2>
                <span className="rounded-full bg-surface-subtle px-3 py-1 text-sm font-semibold text-fg-muted">
                  {data.past.length}
                </span>
              </div>

              <div className="space-y-3 opacity-80">
                {data.past.length ? (
                  data.past.map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      identityId={identityId}
                      onUpdated={load}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-line p-7 text-center text-fg-muted">
                    No interview history yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </>
  );
}

export default function HireMeManagerPage(): React.ReactElement {
  const [authenticated, setAuthenticated] =
    useState(() => Boolean(getToken()));

  if (!authenticated) {
    return (
      <>
        <Nav />

        <main className="mx-auto max-w-lg px-5 py-12">
          <Gate
            onReady={() => setAuthenticated(true)}
          />
        </main>
      </>
    );
  }

  return <Inbox />;
}