"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Deliberately the same message either way — telling the visitor whether an
  // address is registered would let anyone test addresses against the app.
  if (sent) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-2 text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-slate-600">
          If an account exists for {email}, we&apos;ve sent a link to reset the password. It
          expires in an hour.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-slate-700 underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Reset your password</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Link href="/login" className="block text-center text-xs text-slate-600 underline">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
