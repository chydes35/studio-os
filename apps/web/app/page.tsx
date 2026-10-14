"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCachedUser } from "../lib/auth";
import { api, type Booking, type OpenInvoice } from "../lib/api";
import { formatCents } from "../lib/format";

const stageLabel = (stage: Booking["stage"]) =>
  stage[0] + stage.slice(1).toLowerCase();

export default function Home() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("America/Chicago");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([api.listBookings(), api.listOpenInvoices()])
      .then(([bookingList, openInvoices]) => {
        setBookings(bookingList);
        setInvoices(openInvoices);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const user = getCachedUser();
    setOwnerId(user?.id ?? null);
    setTimezone(user?.timezone ?? "America/Chicago");
    load();
  }, []);

  const upcoming = bookings
    .filter(
      (booking) =>
        booking.scheduledAt &&
        booking.stage !== "CLOSED" &&
        new Date(booking.scheduledAt).getTime() >= Date.now(),
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
    )
    .slice(0, 5);

  const outstandingCents = invoices.reduce(
    (total, invoice) => total + invoice.balanceCents,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Studio overview</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your next shoots and invoices that still need attention.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Could not load your studio overview. {error}</span>
          <button onClick={load} className="rounded border border-red-300 px-3 py-1 text-xs font-medium">Try again</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading your overview…</p>
      ) : !error ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">Upcoming shoots</h2>
              <Link href="/bookings" className="text-xs text-slate-600 underline">All bookings</Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                No upcoming shoots are scheduled.
                <Link href="/bookings" className="ml-1 font-medium underline">Schedule one</Link>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {upcoming.map((booking) => (
                  <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/bookings/${booking.id}`} className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2">
                        {booking.client.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{booking.shootType} · {stageLabel(booking.stage)}</p>
                    </div>
                    <time className="text-right text-xs text-slate-600" dateTime={booking.scheduledAt ?? undefined}>
                      {new Date(booking.scheduledAt!).toLocaleString(undefined, {
                        timeZone: timezone,
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-400">Times shown in {timezone}.</p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Unpaid invoices</h2>
              <span className="text-xs font-medium text-slate-600">{formatCents(outstandingCents)} outstanding</span>
            </div>
            {invoices.length === 0 ? (
              <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">You’re all caught up. There are no unpaid invoices.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/bookings/${invoice.booking.id}`} className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2">
                        {invoice.booking.client.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{invoice.booking.shootType} · {invoice.status.replaceAll("_", " ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCents(invoice.balanceCents)}</p>
                      {invoice.dueAt && <p className="text-xs text-slate-500">Due {new Date(invoice.dueAt).toLocaleDateString()}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <Link href="/clients" className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
          <h2 className="text-base font-semibold">Clients</h2>
          <p className="mt-1 text-sm text-slate-600">View, add, and update your client records.</p>
        </Link>
        <Link href="/bookings" className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
          <h2 className="text-base font-semibold">Bookings</h2>
          <p className="mt-1 text-sm text-slate-600">Schedule a shoot or manage its full job details.</p>
        </Link>
        <Link href="/availability" className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
          <h2 className="text-base font-semibold">Availability</h2>
          <p className="mt-1 text-sm text-slate-600">Set your working hours and block off personal time.</p>
        </Link>
        {ownerId && (
          <Link href={`/book/${ownerId}`} className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
            <h2 className="text-base font-semibold">Public booking page</h2>
            <p className="mt-1 text-sm text-slate-600">Preview the page clients use to request a shoot.</p>
          </Link>
        )}
      </section>
    </div>
  );
}
