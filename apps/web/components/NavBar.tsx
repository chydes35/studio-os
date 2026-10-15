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
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Studio OS
        </Link>

        {ownerId ? (
          <>
            <details className="group relative ml-auto md:hidden">
              <summary className="cursor-pointer list-none rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">
                Menu <span aria-hidden="true">☰</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 grid min-w-52 gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <MobileLinks ownerId={ownerId} onLogout={handleLogout} />
              </div>
            </details>
            <div className="hidden flex-1 flex-wrap items-center gap-x-4 gap-y-2 md:flex">
              <OwnerLinks />
              <Link href={`/book/${ownerId}`} className="ml-auto text-xs text-slate-500 hover:text-slate-900">
                Public booking ↗
              </Link>
              <button onClick={handleLogout} className="text-xs text-slate-600 hover:text-slate-900">
                Log out
              </button>
            </div>
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

function OwnerLinks({ mobile = false }: { mobile?: boolean }) {
  const links: Array<[string, string]> = [
    ["/clients", "Clients"],
    ["/bookings", "Bookings"],
    ["/availability", "Availability"],
    ["/contracts/templates", "Contracts"],
    ["/expenses", "Expenses"],
    ["/questionnaires/templates", "Questionnaires"],
    ["/notifications", "Notifications"],
    ["/equipment", "Equipment"],
    ["/locations", "Locations"],
    ["/account", "Account"],
  ];
  return <>{links.map(([href, label]) => (
    <Link key={href} href={href} className={mobile ? "block rounded px-2 py-2 text-sm text-slate-600 hover:bg-slate-50" : "text-xs text-slate-600 hover:text-slate-900"}>{label}</Link>
  ))}</>;
}

function MobileLinks({ ownerId, onLogout }: { ownerId: string; onLogout: () => void }) {
  return (
    <>
      <OwnerLinks mobile />
      <Link href={`/book/${ownerId}`} className="rounded px-2 py-2 text-sm text-slate-600 hover:bg-slate-50">
        Public booking page ↗
      </Link>
      <button onClick={onLogout} className="rounded px-2 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
        Log out
      </button>
    </>
  );
}
