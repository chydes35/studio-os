"use client";

import { useDroppable } from "@dnd-kit/core";
import type { BookingStage } from "@repo/shared";
import type { Booking } from "../../lib/api";
import { BookingCard } from "./BookingCard";

export const STAGE_LABELS: Record<BookingStage, string> = {
  INQUIRY: "Inquiry",
  BOOKED: "Booked",
  SHOT: "Shot",
  EDITING: "Editing",
  DELIVERED: "Delivered",
  CLOSED: "Closed",
};

export function BookingColumn({
  stage,
  bookings,
}: {
  stage: BookingStage;
  bookings: Booking[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-lg border border-slate-200 bg-slate-50 p-2 ${
        isOver ? "ring-2 ring-slate-400" : ""
      }`}
    >
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {STAGE_LABELS[stage]} · {bookings.length}
      </h3>
      <div className="flex flex-1 flex-col gap-2">
        {bookings.length === 0 ? (
          <p className="px-1 py-2 text-xs text-slate-400">Nothing in this stage yet.</p>
        ) : bookings.map((b) => (
          <BookingCard key={b.id} booking={b} />
        ))}
      </div>
    </div>
  );
}
