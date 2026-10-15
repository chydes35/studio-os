"use client";

import { useEffect, useState } from "react";
import { api, type Booking, type Contract, type ContractTemplate } from "../../../lib/api";
import { CopyLinkButton } from "../../../components/CopyLinkButton";

function extractVariableNames(bodyMarkdown: string): string[] {
  const matches = bodyMarkdown.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1]).filter((s) => s !== undefined)));
}

function defaultValueFor(key: string, booking: Booking): string {
  switch (key) {
    case "client_name":
      return booking.client.name;
    case "client_email":
      return booking.client.email;
    case "shoot_type":
      return booking.shootType;
    case "shoot_date":
      return booking.scheduledAt ? new Date(booking.scheduledAt).toLocaleDateString() : "";
    default:
      return "";
  }
}

export function BookingContractSection({
  bookingId,
  booking,
}: {
  bookingId: string;
  booking: Booking;
}) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    Promise.all([api.listContractTemplates(), api.getContractForBooking(bookingId)])
      .then(([t, c]) => {
        setTemplates(t);
        setContract(c);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [bookingId]);

  function handleSelectTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const vars: Record<string, string> = {};
    for (const key of extractVariableNames(template.bodyMarkdown)) {
      vars[key] = defaultValueFor(key, booking);
    }
    setVariables(vars);
  }

  async function handleCreateContract(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createContract(bookingId, { templateId, variables });
      setContract(created);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload() {
    if (!contract) return;
    try {
      const { url } = await api.getContractDownloadUrl(contract.id);
      window.open(url, "_blank");
    } catch (err) {
      setError(String(err));
    }
  }

  if (loading) return null;

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const contractUrl =
    typeof window !== "undefined" && contract
      ? `${window.location.origin}/contracts/${contract.id}`
      : "";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Contract</h2>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {!contract ? (
        templates.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No contract templates yet — create one on the{" "}
            <a href="/contracts/templates" className="underline">
              templates page
            </a>
            .
          </p>
        ) : (
          <form onSubmit={handleCreateContract} className="mt-3 space-y-3">
            <select
              required
              value={templateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="" disabled>
                Select a template
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            {selectedTemplate &&
              extractVariableNames(selectedTemplate.bodyMarkdown).map((key) => (
                <div key={key}>
                  <label className="block text-xs text-slate-500">{key}</label>
                  <input
                    value={variables[key] ?? ""}
                    onChange={(e) => setVariables({ ...variables, [key]: e.target.value })}
                    className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              ))}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create contract"}
            </button>
          </form>
        )
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            Status:{" "}
            {contract.signedAt ? (
              <span className="font-medium text-green-700">
                Signed by {contract.signerName} on{" "}
                {new Date(contract.signedAt).toLocaleDateString()}
              </span>
            ) : (
              <span className="font-medium text-amber-700">Awaiting signature</span>
            )}
          </p>
          <p className="break-all text-sm text-slate-600">{contractUrl}</p>
          <CopyLinkButton value={contractUrl} label="Copy contract link" />
          {contract.signedAt && (
            <button
              onClick={handleDownload}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Download signed PDF
            </button>
          )}
        </div>
      )}
    </div>
  );
}
