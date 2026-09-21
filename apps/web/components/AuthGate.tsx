"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { clearToken, getToken, isPublicPath, setCachedUser } from "../lib/auth";

/**
 * Redirects to /login for any owner-only page when there's no valid token.
 * Public (client-facing) pages render immediately without ever touching
 * auth state — a client viewing their gallery/contract/invoice link should
 * never be asked to log in.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      setChecking(false);
      return;
    }

    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    api
      .getMe()
      .then((user) => {
        setCachedUser(user);
        setChecking(false);
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
    // Re-validate on every owner-only navigation, not just first mount —
    // cheap, and catches a token that expired mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!isPublicPath(pathname) && checking) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
