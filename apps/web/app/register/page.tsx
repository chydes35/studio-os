"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../lib/api";
import { setCachedUser, setToken } from "../../lib/auth";
import { registrationOpen } from "../../lib/registration";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { accessToken, user } = await api.register({
        name,
        email,
        password,
        // The studio's availability hours are interpreted in this zone;
        // changeable later on the Availability page.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setToken(accessToken);
      setCachedUser(user);
      router.replace("/");
    } catch (err) {
      setError(String(err).includes("Sign-ups are closed") ? "Sign-ups are closed for this studio." : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!registrationOpen()) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-2 text-xl font-semibold">Sign-ups are closed</h1>
        <p className="text-sm text-slate-600">
          This studio is not accepting new accounts.{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Create your studio account</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          required
          minLength={8}
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-3 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
