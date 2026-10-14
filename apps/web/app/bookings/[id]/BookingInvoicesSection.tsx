"use client";

import { useEffect, useState } from "react";
import { api, type Invoice } from "../../../lib/api";
import { dollarsToCents, formatCents } from "../../../lib/format";
import { CopyLinkButton } from "../../../components/CopyLinkButton";

type LineItemForm = { description: string; quantity: string; unitPrice: string };

const EMPTY_LINE_ITEM: LineItemForm = { description: "", quantity: "1", unitPrice: "" };

export function BookingInvoicesSection({ bookingId }: { bookingId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [dueAt, setDueAt] = useState("");
  const [lineItems, setLineItems] = useState<LineItemForm[]>([{ ...EMPTY_LINE_ITEM }]);
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    api
      .listInvoicesForBooking(bookingId)
      .then(setInvoices)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [bookingId]);

  function updateLineItem(index: number, patch: Partial<LineItemForm>) {
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, ...patch } : li)));
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createInvoice(bookingId, {
        dueAt: dueAt ? new Date(dueAt) : undefined,
        lineItems: lineItems
          .filter((li) => li.description && li.unitPrice)
          .map((li) => ({
            description: li.description,
            quantity: Number(li.quantity) || 1,
            unitAmountCents: dollarsToCents(li.unitPrice),
          })),
      });
      setLineItems([{ ...EMPTY_LINE_ITEM }]);
      setDueAt("");
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkSent(id: string) {
    setError(null);
    try {
      await api.markInvoiceSent(id);
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleMarkPaid(id: string) {
    const amount = payAmounts[id];
    if (!amount) return;
    setError(null);
    try {
      await api.markInvoicePaid(id, dollarsToCents(amount));
      setPayAmounts((prev) => ({ ...prev, [id]: "" }));
      load();
    } catch (err) {
      setError(String(err));
    }
  }

  if (loading) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Invoices</h2>
      <p className="mt-1 text-xs text-slate-500">
        “Mark sent” records the status here; it does not email the invoice.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {invoices.length > 0 && (
        <div className="mt-3 space-y-3">
          {invoices.map((inv) => {
            const invoiceUrl =
              typeof window !== "undefined"
                ? `${window.location.origin}/invoices/${inv.id}`
                : "";
            return (
              <div key={inv.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{inv.status}</span>
                  <span>{formatCents(inv.totalCents)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Paid {formatCents(inv.paidCents)} · Balance {formatCents(inv.balanceCents)}
                </p>
                <p className="mt-1 break-all text-xs text-slate-400">{invoiceUrl}</p>
                <div className="mt-2"><CopyLinkButton value={invoiceUrl} label="Copy invoice link" /></div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {inv.status === "DRAFT" && (
                    <button
                      onClick={() => handleMarkSent(inv.id)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      Mark sent
                    </button>
                  )}
                  {inv.balanceCents > 0 && (
                    <>
                      <input
                        placeholder="Amount"
                        value={payAmounts[inv.id] ?? ""}
                        onChange={(e) =>
                          setPayAmounts((prev) => ({ ...prev, [inv.id]: e.target.value }))
                        }
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => handleMarkPaid(inv.id)}
                        className="rounded bg-slate-900 px-2 py-1 text-xs text-white"
                      >
                        Record payment
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={handleCreateInvoice} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        <h3 className="text-xs font-semibold text-slate-500">New invoice</h3>
        {lineItems.map((li, i) => (
          <div key={i} className="flex gap-2">
            <input
              placeholder="Description"
              value={li.description}
              onChange={(e) => updateLineItem(i, { description: e.target.value })}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Qty"
              value={li.quantity}
              onChange={(e) => updateLineItem(i, { quantity: e.target.value })}
              className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="$ each"
              value={li.unitPrice}
              onChange={(e) => updateLineItem(i, { unitPrice: e.target.value })}
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLineItems((prev) => [...prev, { ...EMPTY_LINE_ITEM }])}
          className="text-xs text-slate-500 underline"
        >
          + Add line item
        </button>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="block rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create invoice"}
        </button>
      </form>
    </div>
  );
}
