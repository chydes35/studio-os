"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import type { BookingStage } from "@repo/shared";
import { useEffect, useState } from "react";
import { api, type Booking, type Client } from "../../lib/api";
import { BookingColumn } from "./BookingColumn";
import { NewBookingForm } from "./NewBookingForm";

const STAGES: BookingStage[] = [
  "INQUIRY",
  "BOOKED",
  "SHOT",
  "EDITING",
  "DELIVERED",
  "CLOSED",
];

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.listBookings(), api.listClients()])
      .then(([b, c]) => {
        setBookings(b);
        setClients(c);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const bookingId = String(active.id);
    const newStage = over.id as BookingStage;
    const current = bookings.find((b) => b.id === bookingId);
    if (!current || current.stage === newStage) return;

    const previous = bookings;
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, stage: newStage } : b)),
    );
    try {
      await api.updateBookingStage(bookingId, newStage);
    } catch (err) {
      setError(String(err));
      setBookings(previous);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Bookings</h1>
      </div>
      <div className="mb-4">
        <NewBookingForm clients={clients} onCreated={load} />
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <DndContext onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <BookingColumn
                key={stage}
                stage={stage}
                bookings={bookings.filter((b) => b.stage === stage)}
              />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}
