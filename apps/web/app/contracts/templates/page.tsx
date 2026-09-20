"use client";

import { useEffect, useState } from "react";
import { api, type ContractTemplate } from "../../../lib/api";

export default function ContractTemplatesPage() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", bodyMarkdown: "" });

  const load = () => {
    setLoading(true);
    api
      .listContractTemplates()
      .then(setTemplates)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createContractTemplate(form);
      setForm({ name: "", bodyMarkdown: "" });
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
      await api.deleteContractTemplate(id);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="mb-4 text-xl font-semibold">Contract templates</h1>
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
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                  {t.bodyMarkdown}
                </pre>
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
          placeholder="Template name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <textarea
          required
          rows={10}
          placeholder={
            "e.g.\n\nThis agreement is between {{owner_name}} and {{client_name}} for a {{shoot_type}} session on {{shoot_date}}.\n\nTotal price: {{price}}"
          }
          value={form.bodyMarkdown}
          onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono text-xs"
        />
        <p className="text-xs text-slate-400">
          Use <code>{"{{variable_name}}"}</code> for anything you&apos;ll fill in per
          booking — e.g. <code>{"{{client_name}}"}</code>, <code>{"{{shoot_date}}"}</code>,{" "}
          <code>{"{{price}}"}</code>.
        </p>
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
