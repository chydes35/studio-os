import type { AuthUser } from "@repo/shared";

const TOKEN_KEY = "studio_os_token";
const USER_KEY = "studio_os_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

/** Cached alongside the token purely so the nav bar can render instantly without an extra /auth/me round-trip on every navigation. Not trusted for anything security-sensitive — the API always re-derives the owner from the token itself. */
export function getCachedUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function setCachedUser(user: AuthUser) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

/**
 * Paths a client (not the studio owner) can land on without logging in:
 * the public booking portal and the various capability-URL pages shared
 * directly with clients (galleries, contracts, invoices, questionnaires).
 *
 * `/contracts/*` and `/questionnaires/*` each have BOTH a public capability-
 * URL page (`/contracts/[id]`, `/questionnaires/[id]`) and an owner-only
 * page under the same prefix (`/contracts/templates`,
 * `/questionnaires/templates`) — a plain prefix match would wrongly treat
 * the owner's templates pages as public, so those two need an explicit
 * carve-out rather than a simple `startsWith`.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/register") return true;
  if (pathname.startsWith("/book/")) return true;
  if (pathname.startsWith("/gallery/")) return true;
  if (pathname.startsWith("/invoices/")) return true;
  if (pathname.startsWith("/contracts/") && !pathname.startsWith("/contracts/templates")) {
    return true;
  }
  if (
    pathname.startsWith("/questionnaires/") &&
    !pathname.startsWith("/questionnaires/templates")
  ) {
    return true;
  }
  return false;
}
