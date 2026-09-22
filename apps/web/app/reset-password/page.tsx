"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "../../lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.resetPassword({ token, password });
      // Signing in again is the point: the reset invalidated every existing
      // session, including this browser's if it had one.
      router.replace("/login?reset=1");
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="mb-2 text-xl font-semibold">Link not valid</h1>
        <p className="text-sm text-slate-600">
          This page needs the link from your reset email.
        </p>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-semibold">Choose a new password</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input
          required
          type="password"
          minLength={8}
          placeholder="New password (at least 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          required
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Set new password"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-center text-xs text-slate-500">
          Reset links expire an hour after they&apos;re sent and work once.
        </p>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
