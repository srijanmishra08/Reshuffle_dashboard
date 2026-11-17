"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, jsonBody } from "@/lib/api";

/**
 * The client's answer on work waiting for review: approve it, or ask for changes with a comment saying what to change.
 * The comment is required to ask for changes and optional when approving. It stays on the task for the team and the freelancer.
 */
export function ReviewActions({ taskId, readOnly = false }: { taskId: string; readOnly?: boolean }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(decision: "APPROVE" | "REVISE") {
    if (decision === "REVISE" && comment.trim() === "") {
      setError("Tell the team what to change before asking for changes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/portal/client/tasks/${taskId}/respond`, { method: "POST", ...jsonBody({ decision, comment: comment.trim() }) });
      setComment("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your answer");
    } finally {
      setBusy(false);
    }
  }

  if (readOnly) return <span className="text-xs text-stone-500">Preview: approving and requesting changes are off.</span>;

  return (
    <div className="w-full max-w-md space-y-2">
      <label className="block text-xs text-stone-600">
        Comment <span className="text-stone-400">(needed to request changes)</span>
        <textarea
          rows={2}
          value={comment}
          maxLength={2000}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What should change, or a note with your approval"
          className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => void send("APPROVE")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Approve
        </button>
        <button disabled={busy} onClick={() => void send("REVISE")} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 disabled:opacity-50">
          Request changes
        </button>
        {error ? <span className="text-xs text-rose-600" role="alert">{error}</span> : null}
      </div>
    </div>
  );
}
