"use client";

import { useEffect, useState } from "react";
import type { QuestionnaireFieldType } from "@repo/shared";
import { api, type QuestionnaireTemplate } from "../../../lib/api";

type FieldForm = {
  label: string;
  type: QuestionnaireFieldType;
  optionsText: string;
};

const EMPTY_FIELD: FieldForm = { label: "", type: "text", optionsText: "" };

function slugify(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `field_${index}`;
}

export default function QuestionnaireTemplatesPage() {
  const [templates, setTemplates] = useState<QuestionnaireTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [fields, setFields] = useState<FieldForm[]>([{ ...EMPTY_FIELD }]);

  const load = () => {
    setLoading(true);
    api
      .listQuestionnaireTemplates()
      .then(setTemplates)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  function updateField(index: number, patch: Partial<FieldForm>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createQuestionnaireTemplate({
        name,
        fields: fields
          .filter((f) => f.label)
          .map((f, i) => ({
            id: slugify(f.label, i),
            label: f.label,
            type: f.type,
            options:
              f.type === "select"
                ? f.optionsText.split(",").map((o) => o.trim()).filter(Boolean)
                : undefined,
          })),
      });
      setName("");
      setFields([{ ...EMPTY_FIELD }]);
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteQuestionnaireTemplate(id);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div>
        <h1 className="mb-4 text-xl font-semibold">Questionnaire templates</h1>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-slate-500">No templates yet.</p>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{t.name}</h2>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-slate-500">
                  {t.schema.map((f) => (
                    <li key={f.id}>
                      {f.label}{" "}
                      <span className="text-slate-400">
                        ({f.type}
                        {f.options ? `: ${f.options.join(", ")}` : ""})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="h-fit space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold">New template</h2>
        <input
          required
          placeholder="Template name (e.g. Pre-shoot questionnaire)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />

        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="space-y-1 rounded border border-slate-200 p-2">
              <div className="flex gap-2">
                <input
                  placeholder="Question label"
                  value={f.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                />
                <select
                  value={f.type}
                  onChange={(e) =>
                    updateField(i, { type: e.target.value as QuestionnaireFieldType })
                  }
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Dropdown</option>
                  <option value="checkbox">Checkbox</option>
                </select>
              </div>
              {f.type === "select" && (
                <input
                  placeholder="Options, comma separated"
                  value={f.optionsText}
                  onChange={(e) => updateField(i, { optionsText: e.target.value })}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFields((prev) => [...prev, { ...EMPTY_FIELD }])}
          className="text-xs text-slate-500 underline"
        >
          + Add question
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save template"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  );
}
