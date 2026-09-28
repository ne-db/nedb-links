import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

interface InterviewType {
  identityId: string;
  interviewTypeId: string;
  slug: string;
  title: string;
  description?: string;
  durationMinutes: number;
  locationLabel?: string;
}

interface Slot {
  startsAt: string;
  endsAt: string;
}

interface Confirmation {
  id: string;
  title: string;
  confirmationTitle: string;
  confirmationMessage: string;
  startsAt: string;
  endsAt: string;
  locationLabel?: string;
  candidateName: string;
  candidateEmail: string;
  status: "confirmed";
}
function routeParameters(): {
  identityId: string;
  slug: string;
} {
  const parts = window.location.pathname
    .split("/")
    .filter(Boolean);

  return {
    identityId: decodeURIComponent(
      parts[1] ?? "",
    ),
    slug: decodeURIComponent(parts[2] ?? ""),
  };
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export default function HireMeBookingPage(): React.ReactElement {
  const { identityId, slug } = useMemo(
    routeParameters,
    [],
  );
  const [interviewType, setInterviewType] =
    useState<InterviewType | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedStart, setSelectedStart] =
    useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] =
    useState<Confirmation | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const base = `/api/hireme/types/${encodeURIComponent(
        identityId,
      )}/${encodeURIComponent(slug)}`;
      const [typeResponse, slotsResponse] =
        await Promise.all([
          fetch(base),
          fetch(`${base}/slots`),
        ]);

      const typePayload = (await typeResponse.json()) as {
        interviewType?: InterviewType;
        error?: string;
      };
      const slotsPayload = (await slotsResponse.json()) as {
        slots?: Slot[];
        error?: string;
      };

      if (!typeResponse.ok) {
        throw new Error(
          typePayload.error ||
            "This interview link is unavailable.",
        );
      }

      if (!slotsResponse.ok) {
        throw new Error(
          slotsPayload.error ||
            "Available times could not be loaded.",
        );
      }

      setInterviewType(
        typePayload.interviewType ?? null,
      );
      setSlots(slotsPayload.slots ?? []);
      setSelectedStart((current) =>
        (slotsPayload.slots ?? []).some(
          (slot) =>
            slot.startsAt === current,
        )
          ? current
          : "",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "HireMe could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [identityId, slug]);

  const slotsByDate = useMemo(() => {
    const groups = new Map<string, Slot[]>();

    for (const slot of slots) {
      const key = dateLabel(slot.startsAt);
      const existing = groups.get(key) ?? [];
      existing.push(slot);
      groups.set(key, existing);
    }

    return Array.from(groups.entries());
  }, [slots]);

  async function submit(
    event: React.FormEvent,
  ): Promise<void> {
    event.preventDefault();

    if (!selectedStart) {
      setError("Choose an interview time.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/hireme/types/${encodeURIComponent(
          identityId,
        )}/${encodeURIComponent(slug)}/bookings`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            startsAt: selectedStart,
            name,
            email,
            phone: phone || undefined,
          }),
        },
      );
      const payload = (await response.json()) as {
        booking?: Confirmation;
        error?: string;
      };

      if (!response.ok || !payload.booking) {
        if (response.status === 409) {
          await load();
        }

        throw new Error(
          payload.error ||
            "Your interview could not be booked.",
        );
      }

      setConfirmation(payload.booking);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your interview could not be booked.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <main className="min-h-screen bg-bg px-5 py-12 text-fg">
        <section className="mx-auto max-w-lg rounded-3xl border border-line bg-surface p-7 shadow-xl">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl text-emerald-600">
            ✓
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.16em] text-fg-muted">
            HireMe by OurLynx
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            {confirmation.confirmationTitle}
          </h1>

          <p className="mt-3 whitespace-pre-line text-fg-muted">
            {confirmation.confirmationMessage}
          </p>

          <dl className="mt-6 space-y-4 rounded-2xl border border-line bg-surface-subtle p-5">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Interview
              </dt>
              <dd className="mt-1 font-medium">
                {confirmation.title}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Date
              </dt>
              <dd className="mt-1 font-medium">
                {dateLabel(confirmation.startsAt)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Time
              </dt>
              <dd className="mt-1 font-medium">
                {timeLabel(confirmation.startsAt)}
              </dd>
            </div>

            {confirmation.locationLabel ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Location
                </dt>
                <dd className="mt-1 font-medium">
                  {confirmation.locationLabel}
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-5 text-sm leading-relaxed text-fg-muted">
            Confirmation is recorded for{" "}
            {confirmation.candidateEmail}.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg px-5 py-10 text-fg">
      <section className="mx-auto max-w-4xl">
        <header className="mb-7">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-fg-muted">
            HireMe by OurLynx
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            {interviewType?.title ??
              "Schedule an interview"}
          </h1>
          {interviewType?.description ? (
            <p className="mt-3 max-w-2xl text-fg-muted">
              {interviewType.description}
            </p>
          ) : null}
          {interviewType ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-line px-3 py-1 text-sm">
                {interviewType.durationMinutes}{" "}
                minutes
              </span>
              {interviewType.locationLabel ? (
                <span className="rounded-full border border-line px-3 py-1 text-sm">
                  {
                    interviewType.locationLabel
                  }
                </span>
              ) : null}
            </div>
          ) : null}
        </header>

        {error ? (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-line bg-surface p-8 text-fg-muted">
            Loading available interviews…
          </div>
        ) : interviewType ? (
          <form
            onSubmit={(event) => void submit(event)}
            className="grid gap-6 lg:grid-cols-[1.35fr_1fr]"
          >
            <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="text-lg font-bold">
                Choose a time
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                Times are shown in your local
                timezone.
              </p>

              <div className="mt-5 max-h-[520px] space-y-6 overflow-y-auto pr-1">
                {slotsByDate.length ? (
                  slotsByDate.map(
                    ([date, dateSlots]) => (
                      <div key={date}>
                        <h3 className="mb-2 text-sm font-semibold">
                          {date}
                        </h3>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {dateSlots.map((slot) => {
                            const selected =
                              selectedStart ===
                              slot.startsAt;

                            return (
                              <button
                                key={
                                  slot.startsAt
                                }
                                type="button"
                                aria-pressed={
                                  selected
                                }
                                onClick={() =>
                                  setSelectedStart(
                                    slot.startsAt,
                                  )
                                }
                                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                                  selected
                                    ? "border-accent bg-accent text-white"
                                    : "border-line hover:border-accent"
                                }`}
                              >
                                {timeLabel(
                                  slot.startsAt,
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ),
                  )
                ) : (
                  <p className="rounded-2xl bg-surface-subtle p-4 text-sm text-fg-muted">
                    No interview times are
                    currently available.
                  </p>
                )}
              </div>
            </section>

            <section className="h-fit rounded-3xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="text-lg font-bold">
                Your details
              </h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="hireme-name"
                    className="mb-1 block text-sm font-medium"
                  >
                    Name
                  </label>
                  <input
                    id="hireme-name"
                    className="field"
                    required
                    maxLength={200}
                    autoComplete="name"
                    value={name}
                    onChange={(event) =>
                      setName(
                        event.target.value,
                      )
                    }
                  />
                </div>

                <div>
                  <label
                    htmlFor="hireme-email"
                    className="mb-1 block text-sm font-medium"
                  >
                    Email
                  </label>
                  <input
                    id="hireme-email"
                    className="field"
                    required
                    type="email"
                    maxLength={320}
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(
                        event.target.value,
                      )
                    }
                  />
                </div>

                <div>
                  <label
                    htmlFor="hireme-phone"
                    className="mb-1 block text-sm font-medium"
                  >
                    Phone{" "}
                    <span className="text-fg-subtle">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="hireme-phone"
                    className="field"
                    type="tel"
                    maxLength={50}
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value,
                      )
                    }
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  submitting ||
                  !selectedStart ||
                  slots.length === 0
                }
                className="mt-6 w-full rounded-full bg-accent px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? "Confirming…"
                  : "Confirm interview"}
              </button>
            </section>
          </form>
        ) : null}
      </section>
    </main>
  );
}