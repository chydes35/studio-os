"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { setCachedUser } from "../../lib/auth";

/**
 * The studio's time zone. Working hours below are wall-clock times in this
 * zone, and the public booking page shows slots in it — so it has to match
 * where the photographer actually works, not wherever the server runs.
 */
export function TimeZoneSetting() {
  const [saved, setSaved] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    return all.includes("UTC") ? all : ["UTC", ...all];
  }, []);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    api
      .getMe()
      .then((me) => {
        setSaved(me.timezone);
        setSelected(me.timezone);
      })
      .catch((err) => setStatus(String(err)));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const me = await api.updateMe({ timezone: selected });
      setCachedUser(me);
      setSaved(me.timezone);
      setStatus("Saved.");
    } catch (err) {
      setStatus(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (saved === null) return null;

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm"
    >
      <label htmlFor="studio-timezone" className="font-medium text-slate-700">
        Studio time zone
      </label>
      <select
        id="studio-timezone"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      >
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={saving || selected === saved}
        className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      {saved !== browserZone && selected === saved && (
        <button
          type="button"
          onClick={() => setSelected(browserZone)}
          className="text-xs text-slate-600 underline"
        >
          Use this device&apos;s zone ({browserZone.replace(/_/g, " ")})
        </button>
      )}
      {status && <span className="text-xs text-slate-500">{status}</span>}
    </form>
  );
}
