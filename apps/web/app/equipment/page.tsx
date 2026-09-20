"use client";

import { useEffect, useState } from "react";
import { api, type Equipment } from "../../lib/api";

function serviceStatus(nextServiceDue: string | null): {
  label: string;
  className: string;
} | null {
  if (!nextServiceDue) return null;
  const due = new Date(nextServiceDue);
  const now = new Date();
  const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (daysUntil < 0) return { label: "Overdue for service", className: "text-red-700" };
  if (daysUntil <= 14) return { label: `Service due in ${daysUntil}d`, className: "text-amber-700" };
  return { label: `Service due ${due.toLocaleDateString()}`, className: "text-slate-500" };
}

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    serialNumber: "",
    nextServiceDue: "",
    notes: "",
  });

  const load = () => {
    setLoading(true);
    api
      .listEquipment()
      .then(setEquipment)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createEquipment({
        name: form.name,
        serialNumber: form.serialNumber || undefined,
        nextServiceDue: form.nextServiceDue ? new Date(form.nextServiceDue) : undefined,
        notes: form.notes || undefined,
      });
      setForm({ name: "", serialNumber: "", nextServiceDue: "", notes: "" });
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkServiced(item: Equipment) {
    setError(null);
    try {
      await api.updateEquipment(item.id, { lastServicedAt: new Date() });
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteEquipment(id);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="mb-4 text-xl font-semibold">Equipment</h1>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : equipment.length === 0 ? (
          <p className="text-sm text-slate-500">No equipment tracked yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Serial</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {equipment.map((item) => {
                  const status = serviceStatus(item.nextServiceDue);
                  return (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2">
                        {item.name}
                        {item.notes && (
                          <p className="text-xs text-slate-400">{item.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {item.serialNumber ?? "—"}
                      </td>
                      <td className={`px-4 py-2 ${status?.className ?? "text-slate-400"}`}>
                        {status?.label ?? "No date set"}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleMarkServiced(item)}
                          className="mr-3 text-xs text-slate-600 hover:underline"
                        >
                          Mark serviced
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="h-fit space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold">Add equipment</h2>
        <input
          required
          placeholder="Name (e.g. Canon R5)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="Serial number (optional)"
          value={form.serialNumber}
          onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <div>
          <label className="mb-1 block text-xs text-slate-500">Next service due</label>
          <input
            type="date"
            value={form.nextServiceDue}
            onChange={(e) => setForm({ ...form, nextServiceDue: e.target.value })}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <textarea
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add equipment"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  );
}
