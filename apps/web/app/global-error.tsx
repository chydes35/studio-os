"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="p-8 text-slate-900">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm">Please try again.</p>
        <button className="mt-4 rounded bg-slate-900 px-3 py-2 text-sm text-white" onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  );
}
