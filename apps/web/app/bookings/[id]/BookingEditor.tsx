"use client";

import { useEffect, useState } from "react";
import { api, type Booking, type Client } from "../../../lib/api";

const DURATIONS = [30, 60, 90, 120];

function dateInZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function todayInZone(timeZone: string) {
  return dateInZone(new Date().toISOString(), timeZone);
}

function formatSlot(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function BookingEditor({
  booking,
  onUpdated,
}: {
  booking: Booking;
  onUpdated: (booking: Booking) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [clientId, setClientId] = useState(booking.clientId);
  const [shootType, setShootType] = useState(booking.shootType);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [date, setDate] = useState(booking.scheduledAt ? "" : "");
  const [durationMins, setDurationMins] = useState(booking.durationMins ?? 60);
  const [selectedSlot, setSelectedSlot] = useState(booking.scheduledAt ?? "");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [scheduleChanged, setScheduleChanged] = useState(false);
  const [removeSchedule, setRemoveSchedule] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([api.listClients(), api.getMe()]).then(([allClients, me]) => {
      setClients(allClients);
      setTimeZone(me.timezone);
      setDate(booking.scheduledAt ? dateInZone(booking.scheduledAt, me.timezone) : todayInZone(me.timezone));
      setReady(true);
    }).catch((err) => { setError(String(err)); setReady(true); });
  }, [booking.scheduledAt]);

  async function findTimes() {
    setChecking(true);
    setError(null);
    setSelectedSlot("");
    try {
      const result = await api.getOwnerAvailableSlots(date, durationMins, booking.id);
      setSlots(result.slots);
      setTimeZone(result.timezone);
    } catch (err) {
      setError(String(err));
    } finally {
      setChecking(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (scheduleChanged && !removeSchedule && !selectedSlot) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateBooking(booking.id, {
        clientId,
        shootType,
        notes: notes.trim() || null,
        ...(removeSchedule
          ? { scheduledAt: null, durationMins: null }
          : scheduleChanged
            ? { scheduledAt: new Date(selectedSlot), durationMins }
            : {}),
      });
      onUpdated(updated);
      setScheduleChanged(false);
      setRemoveSchedule(false);
      setSlots(null);
      setSaved(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function changeDate(value: string) {
    setDate(value);
    setSelectedSlot("");
    setSlots(null);
    setScheduleChanged(true);
    setRemoveSchedule(false);
  }

  function changeDuration(value: number) {
    setDurationMins(value);
    setSelectedSlot("");
    setSlots(null);
    setScheduleChanged(true);
    setRemoveSchedule(false);
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Shoot details</h2>
        {saved && <span role="status" className="text-xs text-emerald-700">Saved</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs text-slate-600">Client
          <select required value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-600">Shoot type
          <input required value={shootType} onChange={(e) => setShootType(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
        </label>
      </div>
      <label className="grid gap-1 text-xs text-slate-600">Notes
        <textarea rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
      </label>
      <div className="grid gap-3 rounded-md bg-slate-50 p-3 md:grid-cols-[1fr_140px_auto] md:items-end">
        <label className="grid gap-1 text-xs text-slate-600">Date
          <input type="date" min={todayInZone(timeZone)} value={date} onChange={(e) => changeDate(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900" />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">Length
          <select value={durationMins} onChange={(e) => changeDuration(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
            {DURATIONS.map((duration) => <option key={duration} value={duration}>{duration} min</option>)}
          </select>
        </label>
        <button type="button" disabled={!date || checking} onClick={findTimes} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50">{checking ? "Checking…" : "Find available times"}</button>
        <p className="text-xs text-slate-500 md:col-span-3">Availability is shown in {timeZone.replace(/_/g, " ")}. Current appointment: {booking.scheduledAt ? `${formatSlot(booking.scheduledAt, timeZone)} · ${booking.durationMins ?? 60} min` : "Unscheduled"}.</p>
        {slots && <div className="md:col-span-3">
          {slots.length === 0 ? <p className="text-sm text-slate-500">No openings on this date.</p> : <div className="flex flex-wrap gap-2">
            {slots.map((slot) => <button key={slot} type="button" aria-pressed={selectedSlot === slot} onClick={() => { setSelectedSlot(slot); setScheduleChanged(true); setRemoveSchedule(false); }} className={`rounded border px-3 py-1.5 text-sm ${selectedSlot === slot ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{formatSlot(slot, timeZone)}</button>)}
          </div>}
        </div>}
        {booking.scheduledAt && <button type="button" onClick={() => { setRemoveSchedule(true); setScheduleChanged(false); setSelectedSlot(""); setSlots(null); }} className="w-fit text-xs text-red-700 underline md:col-span-3">Remove scheduled time</button>}
        {scheduleChanged && !selectedSlot && !removeSchedule && <p className="text-xs text-amber-800 md:col-span-3">Choose an available time before saving the schedule change.</p>}
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={!ready || saving || (scheduleChanged && !selectedSlot && !removeSchedule)} className="w-fit rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Save shoot details"}</button>
    </form>
  );
}
