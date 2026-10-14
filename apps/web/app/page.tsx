"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCachedUser } from "../lib/auth";

export default function Home() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    setOwnerId(getCachedUser()?.id ?? null);
  }, []);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/clients"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow"
      >
        <h2 className="text-lg font-semibold">Clients</h2>
        <p className="mt-1 text-sm text-slate-600">
          View and add clients to your studio.
        </p>
      </Link>
      <Link
        href="/bookings"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow"
      >
        <h2 className="text-lg font-semibold">Bookings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Track shoots through your pipeline, from inquiry to delivered.
        </p>
      </Link>
      <Link
        href="/availability"
        className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow"
      >
        <h2 className="text-lg font-semibold">Availability</h2>
        <p className="mt-1 text-sm text-slate-600">
          Set your working hours and block off personal time.
        </p>
      </Link>
      {ownerId && (
        <Link
          href={`/book/${ownerId}`}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <h2 className="text-lg font-semibold">Public booking page</h2>
          <p className="mt-1 text-sm text-slate-600">
            What clients see when they request a shoot.
          </p>
        </Link>
      )}
    </div>
  );
}
