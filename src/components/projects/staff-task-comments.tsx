"use client";

import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";

type Comment = { id: string; authorRole: string; authorName: string; kind: string; body: string; internal: boolean; createdAt: string };

const roleLabel: Record<string, string> = { TEAM: "Team", CLIENT: "Client", FREELANCER: "Freelancer", AGENCY: "Agency" };
const kindBadge: Record<string, { text: string; tone: string }> = {
  REVISION_REQUEST: { text: "Changes requested", tone: "bg-orange-100 text-orange-800" },
  APPROVAL: { text: "Approved", tone: "bg-emerald-100 text-emerald-800" },
};

/** The conversation on a task, as the team sees it: the client's reasons, the freelancer's replies, and internal notes. */
export function StaffTaskComments({ taskId, onChange }: { taskId: string; onChange?: () => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setComments(await api<Comment[]>(`/api/project-tasks/${taskId}/comments`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load comments");
    }
  }, [taskId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/project-tasks/${taskId}/comments`, { method: "POST", ...jsonBody({ body: body.trim(), internal }) });
      setBody("");
      await load();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 md:col-span-4">
      <p className="text-xs font-medium text-slate-600">Comments</p>
      {comments === null ? <p className="text-xs text-slate-500">{error || "Loading..."}</p> : null}
      {comments?.length === 0 ? <p className="text-xs text-slate-500">No comments yet. When a client asks for changes, their reason appears here.</p> : null}
      <ul className="space-y-1.5">
        {comments?.map((c) => (
          <li key={c.id} className="rounded-lg bg-white px-3 py-2 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{c.authorName || roleLabel[c.authorRole]}</span>
              <span>{roleLabel[c.authorRole] ?? c.authorRole}</span>
              <span>{new Date(c.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              {kindBadge[c.kind] ? <span className={`rounded-full px-2 py-0.5 font-medium ${kindBadge[c.kind].tone}`}>{kindBadge[c.kind].text}</span> : null}
              {c.internal ? <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">Internal</span> : null}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-slate-900">{c.body}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-start gap-2">
        <textarea
          rows={2}
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          aria-label="Add a comment"
          placeholder="Reply to the client or leave a note"
          className="min-w-48 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
        />
        <div className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            Internal (hide from client)
          </label>
          <button type="button" disabled={busy || !body.trim()} onClick={() => void add()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Add comment
          </button>
        </div>
      </div>
      {error && comments !== null ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
    </div>
  );
}
