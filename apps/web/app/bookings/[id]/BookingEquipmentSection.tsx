"use client";

import { useEffect, useState } from "react";
import { api, type BookingEquipment, type Equipment } from "../../../lib/api";

export function BookingEquipmentSection({ bookingId }: { bookingId: string }) {
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);
  const [assigned, setAssigned] = useState<BookingEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.listEquipment(), api.listBookingEquipment(bookingId)])
      .then(([all, assignedList]) => {
        setAllEquipment(all);
        setAssigned(assignedList);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [bookingId]);

  const assignedIds = new Set(assigned.map((a) => a.equipmentId));
  const available = allEquipment.filter((e) => !assignedIds.has(e.id));

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!equipmentId) return;
    setAssigning(true);
    setError(null);
    try {
      await api.assignEquipmentToBooking(bookingId, equipmentId);
      setEquipmentId("");
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(equipId: string) {
    setError(null);
    try {
      await api.unassignEquipmentFromBooking(bookingId, equipId);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  if (loading) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Equipment</h2>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {assigned.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {assigned.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            >
              <span>
                {a.equipment.name}
                {a.equipment.serialNumber && (
                  <span className="text-slate-400"> · {a.equipment.serialNumber}</span>
                )}
              </span>
              <button
                onClick={() => handleUnassign(a.equipmentId)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {allEquipment.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No equipment tracked yet — add some on the{" "}
          <a href="/equipment" className="underline">
            equipment page
          </a>
          .
        </p>
      ) : available.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">All tracked equipment is assigned.</p>
      ) : (
        <form onSubmit={handleAssign} className="mt-3 flex gap-2">
          <select
            required
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="" disabled>
              Add gear to this shoot
            </option>
            {available.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={assigning}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {assigning ? "Adding…" : "Add"}
          </button>
        </form>
      )}
    </div>
  );
}
