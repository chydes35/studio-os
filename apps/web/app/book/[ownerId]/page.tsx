"use client";

import { use, useState } from "react";
import { api } from "../../../lib/api";

const DURATIONS = [30, 60, 90, 120];

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function BookPage({
  params,
}: {
  params: Promise<{ ownerId: string }>;
}) {
  const { ownerId } = use(params);

  const [shootType, setShootType] = useState("");
  const [durationMins, setDurationMins] = useState(60);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<string[] | null>(null);
  const [studioTimeZone, setStudioTimeZone] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [contact, setContact] = useState({ name: "", email: "", phone: "" });

  async function handleFindSlots(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSelectedSlot(null);
    setLoadingSlots(true);
    try {
      const result = await api.getAvailableSlots(ownerId, date, durationMins);
      setSlots(result.slots);
      setStudioTimeZone(result.timezone);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createPublicBookingRequest(ownerId, {
        clientName: contact.name,
        clientEmail: contact.email,
        clientPhone: contact.phone || undefined,
        shootType,
        scheduledAt: new Date(selectedSlot),
        durationMins,
      });
      setConfirmed(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">Request sent!</h1>
        <p className="mt-2 text-sm text-slate-600">
          We&apos;ll confirm your booking shortly. Thanks for reaching out.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold">Book a shoot</h1>

      <form onSubmit={handleFindSlots} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <input
          required
          placeholder="Shoot type (e.g. Engagement)"
          value={shootType}
          onChange={(e) => setShootType(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            min={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            value={durationMins}
            onChange={(e) => setDurationMins(Number(e.target.value))}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!shootType || loadingSlots}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loadingSlots ? "Checking…" : "Find available times"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {slots && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Available times on {date}
          </h2>
          {studioTimeZone && (
            <p className="mb-2 text-xs text-slate-500">
              Times shown in the studio&apos;s time zone ({studioTimeZone.replace(/_/g, " ")}).
            </p>
          )}
          {slots.length === 0 ? (
            <p className="text-sm text-slate-500">
              No openings that day — try another date.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSlot(s)}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    selectedSlot === s
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {new Date(s).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: studioTimeZone ?? undefined,
                  })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedSlot && (
        <form
          onSubmit={handleSubmitRequest}
          className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold">Your info</h2>
          <input
            required
            placeholder="Name"
            value={contact.name}
            onChange={(e) => setContact({ ...contact, name: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={contact.email}
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Phone (optional)"
            value={contact.phone}
            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Requesting…" : "Request booking"}
          </button>
        </form>
      )}
    </div>
  );
}
