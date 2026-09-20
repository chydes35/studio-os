"use client";

import { use, useEffect, useState } from "react";
import { api, type PublicInvoice } from "../../../lib/api";
import { formatCents } from "../../../lib/format";

export default function PublicInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingOnline, setPayingOnline] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .getPublicInvoice(id)
      .then(setInvoice)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  async function handlePayOnline() {
    setPayingOnline(true);
    setError(null);
    try {
      const { url } = await api.createInvoiceCheckoutSession(id);
      window.location.href = url;
    } catch (err) {
      setError(String(err));
      setPayingOnline(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!invoice) return <p className="text-sm text-red-600">Invoice not found.</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">Invoice</h1>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1">Description</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5">{li.description}</td>
                <td className="py-1.5 text-right">{li.quantity}</td>
                <td className="py-1.5 text-right">{formatCents(li.unitAmountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Total</span>
            <span>{formatCents(invoice.totalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Paid</span>
            <span>{formatCents(invoice.paidCents)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Balance due</span>
            <span>{formatCents(invoice.balanceCents)}</span>
          </div>
        </div>

        {invoice.dueAt && (
          <p className="mt-2 text-xs text-slate-400">
            Due {new Date(invoice.dueAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {invoice.balanceCents <= 0 ? (
        <p className="mt-4 text-sm font-medium text-green-700">Paid in full — thank you!</p>
      ) : invoice.stripeConfigured ? (
        <button
          onClick={handlePayOnline}
          disabled={payingOnline}
          className="mt-4 w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {payingOnline ? "Redirecting…" : "Pay online"}
        </button>
      ) : (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Online payment isn&apos;t available yet — please contact your photographer to
          arrange payment.
        </p>
      )}
    </div>
  );
}
