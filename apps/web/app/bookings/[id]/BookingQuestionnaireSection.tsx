"use client";

import { useEffect, useState } from "react";
import {
  api,
  type QuestionnaireResponse,
  type QuestionnaireTemplate,
} from "../../../lib/api";
import { CopyLinkButton } from "../../../components/CopyLinkButton";

export function BookingQuestionnaireSection({ bookingId }: { bookingId: string }) {
  const [templates, setTemplates] = useState<QuestionnaireTemplate[]>([]);
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.listQuestionnaireTemplates(),
      api.listQuestionnairesForBooking(bookingId),
    ])
      .then(([t, r]) => {
        setTemplates(t);
        setResponses(r);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [bookingId]);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) return;
    setAssigning(true);
    setError(null);
    try {
      await api.assignQuestionnaire(bookingId, templateId);
      setTemplateId("");
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setAssigning(false);
    }
  }

  if (loading) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Questionnaires</h2>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {responses.length > 0 && (
        <div className="mt-3 space-y-2">
          {responses.map((r) => {
            const url =
              typeof window !== "undefined"
                ? `${window.location.origin}/questionnaires/${r.id}`
                : "";
            return (
              <div key={r.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.template.name}</span>
                  <span
                    className={r.submittedAt ? "text-green-700" : "text-amber-700"}
                  >
                    {r.submittedAt ? "Submitted" : "Pending"}
                  </span>
                </div>
                <p className="mt-1 break-all text-xs text-slate-400">{url}</p>
                <div className="mt-2"><CopyLinkButton value={url} label="Copy questionnaire link" /></div>
              </div>
            );
          })}
        </div>
      )}

      {templates.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No questionnaire templates yet — create one on the{" "}
          <a href="/questionnaires/templates" className="underline">
            templates page
          </a>
          .
        </p>
      ) : (
        <form onSubmit={handleAssign} className="mt-3 flex gap-2">
          <select
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="" disabled>
              Select a template to send
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={assigning}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {assigning ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
