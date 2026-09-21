"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearToken, getCachedUser, getToken } from "../lib/auth";

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    setOwnerId(getToken() ? (getCachedUser()?.id ?? null) : null);
  }, [pathname]);

  function handleLogout() {
    clearToken();
    setOwnerId(null);
    router.replace("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Studio OS
        </Link>

        {ownerId ? (
          <>
            <Link href="/clients" className="text-sm text-slate-600 hover:text-slate-900">
              Clients
            </Link>
            <Link href="/bookings" className="text-sm text-slate-600 hover:text-slate-900">
              Bookings
            </Link>
            <Link href="/availability" className="text-sm text-slate-600 hover:text-slate-900">
              Availability
            </Link>
            <Link
              href="/contracts/templates"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Contract templates
            </Link>
            <Link href="/expenses" className="text-sm text-slate-600 hover:text-slate-900">
              Expenses
            </Link>
            <Link
              href="/questionnaires/templates"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Questionnaires
            </Link>
            <Link href="/notifications" className="text-sm text-slate-600 hover:text-slate-900">
              Notifications
            </Link>
            <Link href="/equipment" className="text-sm text-slate-600 hover:text-slate-900">
              Equipment
            </Link>
            <Link href="/locations" className="text-sm text-slate-600 hover:text-slate-900">
              Locations
            </Link>
            <Link
              href={`/book/${ownerId}`}
              className="ml-auto text-sm text-slate-400 hover:text-slate-600"
            >
              Public booking page ↗
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Log out
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="ml-auto text-sm text-slate-600 hover:text-slate-900"
          >
            Log in
          </Link>
        )}
      </nav>
    </header>
  );
}
