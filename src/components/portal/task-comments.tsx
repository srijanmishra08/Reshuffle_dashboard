"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, jsonBody } from "@/lib/api";

export type PortalComment = { id: string; authorRole: string; authorName: string; kind: string; body: string; createdAt: Date | string };

const roleLabel: Record<string, string> = { TEAM: "Reshuffle", CLIENT: "Client", FREELANCER: "Freelancer", AGENCY: "Agency" };
const kindBadge: Record<string, { text: string; tone: string }> = {
  REVISION_REQUEST: { text: "Changes requested", tone: "bg-orange-100 text-orange-800" },
  APPROVAL: { text: "Approved", tone: "bg-emerald-100 text-emerald-800" },
};

const when = (value: Date | string) =>
  new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The conversation on one task, with a box to add to it. */
export function TaskComments({
  taskId,
  area,
  comments,
  readOnly = false,
}: {
  taskId: string;
  area: "client" | "freelancer" | "agency";
  comments: PortalComment[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/portal/${area}/tasks/${taskId}/comment`, { method: "POST", ...jsonBody({ body: body.trim() }) });
      setBody("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {comments.length === 0 ? <p className="text-xs text-stone-500">No comments yet.</p> : null}
      <ul className="space-y-2">
        {comments.map((c) => {
          const badge = kindBadge[c.kind];
          return (
            <li key={c.id} className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
              <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span className="font-medium text-stone-700">{c.authorName || roleLabel[c.authorRole] || c.authorRole}</span>
                <span>{roleLabel[c.authorRole] ?? c.authorRole}</span>
                <span>{when(c.createdAt)}</span>
                {badge ? <span className={`rounded-full px-2 py-0.5 font-medium ${badge.tone}`}>{badge.text}</span> : null}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-stone-900">{c.body}</p>
            </li>
          );
        })}
      </ul>
      {readOnly ? null : (
        <form onSubmit={add} className="flex flex-wrap items-start gap-2">
          <textarea
            rows={2}
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Add a comment"
            placeholder="Add a comment"
            className="min-w-48 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900"
          />
          <button disabled={busy || !body.trim()} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Comment
          </button>
          {error ? <span className="w-full text-xs text-rose-600" role="alert">{error}</span> : null}
        </form>
      )}
    </div>
  );
}
