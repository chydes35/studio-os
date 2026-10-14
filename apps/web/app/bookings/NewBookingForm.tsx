"use client";

import { useEffect, useState } from "react";
import { api, type Client } from "../../lib/api";

const DURATIONS = [30, 60, 90, 120];

function dateInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatSlot(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function NewBookingForm({
  clients,
  onCreated,
}: {
  clients: Client[];
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [shootType, setShootType] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [durationMins, setDurationMins] = useState(60);
  const [timeZone, setTimeZone] = useState("UTC");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [saveUnscheduled, setSaveUnscheduled] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMe().then((me) => {
      setTimeZone(me.timezone);
      setDate(dateInZone(me.timezone));
    }).catch((err) => setError(String(err)));
  }, []);

  async function handleFindSlots() {
    if (!date) return;
    setChecking(true);
    setError(null);
    setSelectedSlot("");
    setSaveUnscheduled(false);
    try {
      const result = await api.getOwnerAvailableSlots(date, durationMins);
      setSlots(result.slots);
      setTimeZone(result.timezone);
    } catch (err) {
      setError(String(err));
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !shootType || (slots && slots.length > 0 && !selectedSlot && !saveUnscheduled)) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createBooking({
        clientId,
        shootType,
        notes: notes.trim() || undefined,
        ...(selectedSlot ? { scheduledAt: new Date(selectedSlot), durationMins } : {}),
      });
      setClientId("");
      setShootType("");
      setNotes("");
      setSlots(null);
      setSelectedSlot("");
      setSaveUnscheduled(false);
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_120px_auto]">
      <label className="grid gap-1 text-xs text-slate-600">
        Client
        <select required value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
          <option value="" disabled>Select client</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        Shoot type
        <input required placeholder="e.g. Wedding" value={shootType} onChange={(e) => setShootType(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        Notes
        <input placeholder="Optional details" value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      </label>
      <label className="grid gap-1 text-xs text-slate-600">
        Date
        <input type="date" min={dateInZone(timeZone)} value={date} onChange={(e) => { setDate(e.target.value); setSlots(null); setSelectedSlot(""); setSaveUnscheduled(false); }} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      </label>
      <div className="flex items-end gap-2">
        <label className="grid flex-1 gap-1 text-xs text-slate-600">
          Length
          <select value={durationMins} onChange={(e) => { setDurationMins(Number(e.target.value)); setSlots(null); setSelectedSlot(""); setSaveUnscheduled(false); }} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
            {DURATIONS.map((duration) => <option key={duration} value={duration}>{duration} min</option>)}
          </select>
        </label>
        <button type="button" disabled={!date || checking} onClick={handleFindSlots} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-medium disabled:opacity-50">
          {checking ? "Checking…" : "Find times"}
        </button>
      </div>
      {slots && <div className="md:col-span-2 xl:col-span-5">
        <p className="mb-2 text-xs text-slate-500">Available times in {timeZone.replace(/_/g, " ")}</p>
        {slots.length === 0 ? <p className="text-sm text-slate-500">No openings on this date. You can still save this as an unscheduled booking.</p> : (
          <div className="flex flex-wrap gap-2">
            {slots.map((slot) => <button key={slot} type="button" aria-pressed={selectedSlot === slot} onClick={() => { setSelectedSlot(slot); setSaveUnscheduled(false); }} className={`rounded border px-3 py-1.5 text-sm ${selectedSlot === slot ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{formatSlot(slot, timeZone)}</button>)}
          </div>
        )}
        {slots.length > 0 && <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={saveUnscheduled} onChange={(e) => { setSaveUnscheduled(e.target.checked); if (e.target.checked) setSelectedSlot(""); }} />Save as an unscheduled booking</label>}
      </div>}
      <div className="flex items-center gap-3 md:col-span-2 xl:col-span-5">
        <button type="submit" disabled={submitting || !clientId || !shootType || (slots !== null && slots.length > 0 && !selectedSlot && !saveUnscheduled)} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? "Saving…" : selectedSlot ? "Create scheduled booking" : "Create unscheduled booking"}
        </button>
        {selectedSlot && <span className="text-xs text-slate-600">{formatSlot(selectedSlot, timeZone)} · {durationMins} min</span>}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </form>
  );
}
