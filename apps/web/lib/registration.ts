// Whether to offer sign-up at all. serve-public.sh builds the web app with
// NEXT_PUBLIC_REGISTRATION_OPEN copied from the API's REGISTRATION_OPEN, so the
// two cannot disagree. The API is the enforcement point (it refuses with 403);
// this only keeps the UI from advertising a form that cannot work.
// Closed values mirror parseRegistrationOpen in @repo/shared, which makes the
// API refuse to start on anything it does not recognize.
const CLOSED = new Set(["false", "0", "no", "off"]);

export function registrationOpen(): boolean {
  const value = (process.env.NEXT_PUBLIC_REGISTRATION_OPEN ?? "").trim().toLowerCase();
  return !CLOSED.has(value);
}
