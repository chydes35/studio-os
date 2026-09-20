"use client";

import { use, useEffect, useState } from "react";
import { SignaturePad } from "../../../components/SignaturePad";
import { api, type PublicContract } from "../../../lib/api";

export default function PublicContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [contract, setContract] = useState<PublicContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [signerName, setSignerName] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getPublicContract(id)
      .then(setContract)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!signatureImage) {
      setError("Please sign above before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.signContract(id, { signerName, signatureImage });
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload() {
    try {
      const { url } = await api.getContractDownloadUrl(id);
      window.open(url, "_blank");
    } catch (err) {
      setError(String(err));
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!contract) return <p className="text-sm text-red-600">Contract not found.</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">{contract.templateName}</h1>

      <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        {contract.renderedMarkdown}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {contract.signedAt ? (
        <div className="mt-4 rounded-lg border border-green-300 bg-green-50 p-4">
          <p className="text-sm text-green-900">
            Signed by <strong>{contract.signerName}</strong> on{" "}
            {new Date(contract.signedAt).toLocaleString()}.
          </p>
          <button
            onClick={handleDownload}
            className="mt-2 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Download signed PDF
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSign}
          className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold">Sign this contract</h2>
          <input
            required
            placeholder="Your full name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <div>
            <label className="mb-1 block text-xs text-slate-500">
              Sign with your mouse or finger
            </label>
            <SignaturePad onChange={setSignatureImage} />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Sign contract"}
          </button>
        </form>
      )}
    </div>
  );
}
