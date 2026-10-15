"use client";

import { useState } from "react";

export function CopyLinkButton({
  value,
  label = "Copy link",
}: {
  value: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        disabled={!value}
        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {status === "copied" ? "Copied" : label}
      </button>
      {status === "failed" && (
        <span role="status" className="text-xs text-red-700">
          Copy failed. Select the link above and copy it manually.
        </span>
      )}
    </span>
  );
}
