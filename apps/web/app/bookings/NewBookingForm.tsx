"use client";

import { useState } from "react";
import { api, type Client } from "../../lib/api";

export function NewBookingForm({
  clients,
  onCreated,
}: {
  clients: Client[];
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [shootType, setShootType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !shootType) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createBooking({ clientId, shootType });
      setClientId("");
      setShootType("");
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-slate-500">Client</label>
        <select
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            Select client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500">Shoot type</label>
        <input
          required
          placeholder="e.g. Wedding"
          value={shootType}
          onChange={(e) => setShootType(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Adding…" : "New booking"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
