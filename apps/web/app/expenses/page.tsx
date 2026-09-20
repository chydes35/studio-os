"use client";

import { useEffect, useState } from "react";
import { api, type Expense } from "../../lib/api";
import { dollarsToCents, formatCents } from "../../lib/format";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ description: "", category: "", amount: "" });

  const load = () => {
    setLoading(true);
    api
      .listExpenses()
      .then(setExpenses)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createExpense({
        description: form.description,
        category: form.category || undefined,
        amountCents: dollarsToCents(form.amount),
      });
      setForm({ description: "", category: "", amount: "" });
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
      await api.deleteExpense(id);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  const total = expenses.reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="mb-4 text-xl font-semibold">Expenses</h1>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-slate-500">No expenses recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 text-slate-500">
                      {new Date(e.incurredAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">{e.description}</td>
                    <td className="px-4 py-2 text-slate-500">{e.category ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{formatCents(e.amountCents)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-medium">
                  <td className="px-4 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-4 py-2 text-right">{formatCents(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="h-fit space-y-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold">Add expense</h2>
        <input
          required
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="Category (optional)"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          required
          placeholder="Amount ($)"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add expense"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  );
}
