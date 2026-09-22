"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../lib/api";
import { clearToken, setCachedUser, setToken } from "../../lib/auth";

export default function AccountPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      // The change ends every session, so the API hands back a fresh token
      // for this device; storing it is what keeps this tab signed in.
      const { accessToken, user } = await api.changePassword({ currentPassword, newPassword });
      setToken(accessToken);
      setCachedUser(user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setStatus("Password changed. Any other device signed into this account has been signed out.");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOutEverywhere() {
    setSigningOut(true);
    setError(null);
    try {
      await api.signOutEverywhere();
      clearToken();
      router.replace("/login");
    } catch (err) {
      setError(String(err));
      setSigningOut(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-md gap-6">
      <h1 className="text-xl font-semibold">Account</h1>

      <form
        onSubmit={handleChangePassword}
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold">Change password</h2>
        <input
          required
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          required
          type="password"
          minLength={8}
          placeholder="New password (at least 8 characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
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
          disabled={saving}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Change password"}
        </button>
        <p className="text-xs text-slate-500">
          You stay signed in here; every other device is signed out.
        </p>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Sign out everywhere</h2>
        <p className="mt-1 text-xs text-slate-500">
          Ends every session for this account, including this one. Useful if you lost a phone or
          signed in on a computer you no longer have.
        </p>
        <button
          onClick={handleSignOutEverywhere}
          disabled={signingOut}
          className="mt-3 rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out of all devices"}
        </button>
      </div>

      {status && <p className="text-xs text-emerald-700">{status}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
