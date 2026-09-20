"use client";

import { use, useEffect, useState } from "react";
import { api, type PublicQuestionnaire } from "../../../lib/api";

export default function PublicQuestionnairePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [questionnaire, setQuestionnaire] = useState<PublicQuestionnaire | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .getPublicQuestionnaire(id)
      .then((q) => {
        setQuestionnaire(q);
        setAnswers(q.answers ?? {});
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.submitQuestionnaire(id, answers);
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!questionnaire) return <p className="text-sm text-red-600">Questionnaire not found.</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">{questionnaire.templateName}</h1>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {questionnaire.submittedAt ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4">
          <p className="text-sm text-green-900">
            Thanks — this was submitted on{" "}
            {new Date(questionnaire.submittedAt).toLocaleString()}.
          </p>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          {questionnaire.fields.map((f) => (
            <div key={f.id}>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {f.label}
              </label>
              {f.type === "text" && (
                <input
                  value={(answers[f.id] as string) ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              )}
              {f.type === "textarea" && (
                <textarea
                  value={(answers[f.id] as string) ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                  rows={3}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                />
              )}
              {f.type === "select" && (
                <select
                  value={(answers[f.id] as string) ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
              {f.type === "checkbox" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(answers[f.id])}
                    onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.checked })}
                  />
                  Yes
                </label>
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </form>
      )}
    </div>
  );
}
