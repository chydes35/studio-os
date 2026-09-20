"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Booking } from "../../lib/api";

export function BookingCard({ booking }: { booking: Booking }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: booking.id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 10,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <p className="font-medium">{booking.client.name}</p>
      <p className="text-xs text-slate-500">{booking.shootType}</p>
      {booking.scheduledAt && (
        <p className="mt-1 text-xs text-slate-400">
          {new Date(booking.scheduledAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
