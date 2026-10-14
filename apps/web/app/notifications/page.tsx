"use client";

import { useEffect, useState } from "react";
import { api, type EmailLog } from "../../lib/api";

export default function NotificationsPage() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .listEmailLogs()
      .then(setLogs)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleRunNow() {
    setRunning(true);
    setError(null);
    try {
      const result = await api.runNotificationsNow();
      setLastResult(
        `${result.remindersSent} shoot reminder(s), ${result.overdueProcessed} overdue invoice(s) processed`,
      );
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Automated emails</h1>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {running ? "Running…" : "Run checks now"}
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-500">
        Runs automatically every day at 9am: shoot reminders 3 days out, and
        overdue-invoice notices. Temporary email failures are retried up to
        three times. Run checks again to retry failed messages after correcting
        the provider configuration.
      </p>

      {lastResult && (
        <p className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          {lastResult}
        </p>
      )}
      {error && <p className="mb-4 text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500">No automated emails yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{log.type}</td>
                  <td className="px-4 py-2">{log.recipientEmail}</td>
                  <td className="px-4 py-2">{log.subject}</td>
                  <td className="px-4 py-2">
                    {log.status === "sent" ? (
                      <span className="text-green-700">Sent</span>
                    ) : log.status === "failed" ? (
                      <span className="text-red-700">
                        Failed to send — run checks to retry
                      </span>
                    ) : (
                      <span
                        className="text-amber-700"
                        title="Resend isn't configured yet"
                      >
                        Not sent (Resend not configured)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
