"use client";

import { useEffect, useState } from "react";
import { api, type Booking, type Location } from "../../../lib/api";

export function BookingLocationSection({
  bookingId,
  booking,
  onUpdated,
}: {
  bookingId: string;
  booking: Booking;
  onUpdated: (booking: Booking) => void;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .listLocations()
      .then(setLocations)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const locationId = e.target.value || null;
    setSaving(true);
    setError(null);
    try {
      onUpdated(await api.updateBookingLocation(bookingId, locationId));
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Location</h2>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {locations.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No saved locations yet — scout one on the{" "}
          <a href="/locations" className="underline">
            locations page
          </a>
          .
        </p>
      ) : (
        <select
          value={booking.locationId ?? ""}
          onChange={handleChange}
          disabled={saving}
          className="mt-3 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">No location set</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      )}

      {booking.location && (
        <p className="mt-2 text-xs text-slate-500">
          {booking.location.latitude.toFixed(5)}, {booking.location.longitude.toFixed(5)}
          {booking.location.bestTimeOfDay && ` · Best time: ${booking.location.bestTimeOfDay}`}
        </p>
      )}
    </div>
  );
}
