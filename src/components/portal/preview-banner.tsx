"use client";

import { useState } from "react";
import { api } from "@/lib/api";

/** Shown across the top of a portal while an admin is previewing it. Nothing in the preview is real. */
export function PreviewBanner({ area }: { area: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function exit() {
    setBusy(true);
    setError("");
    try {
      await api("/api/preview", { method: "DELETE" });
      window.location.href = "/access";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the preview");
      setBusy(false);
    }
  }

  return (
    <div className="bg-amber-100 px-4 py-2 text-sm text-amber-950" role="status">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <span>
          Previewing the <strong>{area.toLowerCase()}</strong> view with demo data. Nothing here is real, and you are still signed in as yourself.
        </span>
        <span className="flex items-center gap-3">
          {error ? <span className="text-rose-700">{error}</span> : null}
          <button disabled={busy} onClick={() => void exit()} className="rounded-lg bg-amber-950 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
            Exit preview
          </button>
        </span>
      </div>
    </div>
  );
}
