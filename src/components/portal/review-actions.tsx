"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, jsonBody } from "@/lib/api";

/** Approve a piece of work waiting for the client, or send it back for changes. */
export function ReviewActions({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(decision: "APPROVE" | "REVISE") {
    setBusy(true);
    setError("");
    try {
      await api(`/api/portal/client/tasks/${taskId}/respond`, { method: "POST", ...jsonBody({ decision }) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your answer");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={busy} onClick={() => void send("APPROVE")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
        Approve
      </button>
      <button disabled={busy} onClick={() => void send("REVISE")} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 disabled:opacity-50">
        Request changes
      </button>
      {error ? <span className="text-xs text-rose-600" role="alert">{error}</span> : null}
    </div>
  );
}
