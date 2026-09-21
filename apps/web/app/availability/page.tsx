"use client";

import { useEffect, useState } from "react";
import { api, type AvailabilityRule, type CalendarBlock } from "../../lib/api";
import { TimeZoneSetting } from "./TimeZoneSetting";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function AvailabilityPage() {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ruleForm, setRuleForm] = useState({
    dayOfWeek: "1",
    startTime: "09:00",
    endTime: "17:00",
    bufferMinutes: "15",
  });
  const [blockForm, setBlockForm] = useState({ title: "", startsAt: "", endsAt: "" });

  const load = () => {
    setLoading(true);
    Promise.all([api.listAvailabilityRules(), api.listCalendarBlocks()])
      .then(([r, b]) => {
        setRules(r);
        setBlocks(b);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createAvailabilityRule({
        dayOfWeek: Number(ruleForm.dayOfWeek),
        startTime: ruleForm.startTime,
        endTime: ruleForm.endTime,
        bufferMinutes: Number(ruleForm.bufferMinutes),
      });
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDeleteRule(id: string) {
    setError(null);
    try {
      await api.deleteAvailabilityRule(id);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleAddBlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!blockForm.startsAt || !blockForm.endsAt) return;
    try {
      await api.createCalendarBlock({
        title: blockForm.title || undefined,
        startsAt: new Date(blockForm.startsAt),
        endsAt: new Date(blockForm.endsAt),
      });
      setBlockForm({ title: "", startsAt: "", endsAt: "" });
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDeleteBlock(id: string) {
    setError(null);
    try {
      await api.deleteCalendarBlock(id);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="grid gap-8">
      <h1 className="text-xl font-semibold">Availability</h1>
      <TimeZoneSetting />
      {error && <p className="text-xs text-red-600">{error}</p>}

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Working hours
          </h2>
          {rules.length === 0 ? (
            <p className="text-sm text-slate-500">No working hours set yet.</p>
          ) : (
            <ul className="space-y-2">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{DAY_NAMES[r.dayOfWeek]}</span>{" "}
                    {r.startTime}–{r.endTime}{" "}
                    <span className="text-slate-400">
                      (+{r.bufferMinutes}m buffer)
                    </span>
                  </span>
                  <button
                    onClick={() => handleDeleteRule(r.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={handleAddRule}
          className="h-fit rounded-lg border border-slate-200 bg-white p-4"
        >
          <h3 className="mb-3 text-sm font-semibold">Add working hours</h3>
          <div className="space-y-3">
            <select
              value={ruleForm.dayOfWeek}
              onChange={(e) =>
                setRuleForm({ ...ruleForm, dayOfWeek: e.target.value })
              }
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              {DAY_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="time"
                value={ruleForm.startTime}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, startTime: e.target.value })
                }
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
              <input
                type="time"
                value={ruleForm.endTime}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, endTime: e.target.value })
                }
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <input
              type="number"
              min={0}
              value={ruleForm.bufferMinutes}
              onChange={(e) =>
                setRuleForm({ ...ruleForm, bufferMinutes: e.target.value })
              }
              placeholder="Buffer minutes"
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Time off / blocked periods
          </h2>
          {blocks.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing blocked off.</p>
          ) : (
            <ul className="space-y-2">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{b.title ?? "Blocked"}</span>{" "}
                    {new Date(b.startsAt).toLocaleString()} –{" "}
                    {new Date(b.endsAt).toLocaleString()}
                  </span>
                  <button
                    onClick={() => handleDeleteBlock(b.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={handleAddBlock}
          className="h-fit rounded-lg border border-slate-200 bg-white p-4"
        >
          <h3 className="mb-3 text-sm font-semibold">Block off time</h3>
          <div className="space-y-3">
            <input
              placeholder="Title (optional)"
              value={blockForm.title}
              onChange={(e) =>
                setBlockForm({ ...blockForm, title: e.target.value })
              }
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="datetime-local"
              value={blockForm.startsAt}
              onChange={(e) =>
                setBlockForm({ ...blockForm, startsAt: e.target.value })
              }
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="datetime-local"
              value={blockForm.endsAt}
              onChange={(e) =>
                setBlockForm({ ...blockForm, endsAt: e.target.value })
              }
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Block time
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
