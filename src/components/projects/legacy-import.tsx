"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import type { PipelineItem } from "@/lib/pipeline-types";

type ProjectOption = { id: string; name: string; companyName: string };

const select = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const stageLabel = (s: string) => s.replace(/_/g, " ").toLowerCase();

/**
 * Cards still sitting on an older kanban board, with a button to move each into the system that replaced it:
 * `tasks` and `app-dev` move old board cards onto a project's task board, `outreach` turns outreach cards into clients and deals.
 * Nothing is removed until the replacement has been created.
 */
export function LegacyImport({ kind }: { kind: "tasks" | "app-dev" | "outreach" }) {
  const boardKey = kind === "tasks" ? "projects" : kind;
  const moveToProject = kind !== "outreach";
  const [cards, setCards] = useState<PipelineItem[] | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setCards(await api<PipelineItem[]>(`/api/pipelines/${boardKey}/items`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the old board");
    }
  }, [boardKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      if (kind !== "outreach") api<ProjectOption[]>("/api/delivery-projects").then(setProjects).catch(() => setProjects([]));
    }, 0);
    return () => clearTimeout(timer);
  }, [load, kind]);

  async function run(id: string, action: () => Promise<string>) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const discard = (card: PipelineItem) => {
    if (!window.confirm(`Discard "${card.title}" from the old board? It is deleted and cannot be brought back.`)) return;
    void run(card.id, async () => {
      await api(`/api/pipelines/${boardKey}/items/${card.id}`, { method: "DELETE" });
      return `Discarded "${card.title}".`;
    });
  };

  if (cards === null) return error ? <p className="text-sm text-rose-600">{error}</p> : <p className="text-sm text-slate-500">Loading...</p>;

  if (cards.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {kind === "tasks"
          ? "The old task board is empty. Tasks now live on each project's own board, linked to the client."
          : kind === "app-dev"
            ? "No app development cards waiting to be moved onto a project."
            : "No outreach cards waiting to be moved."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {moveToProject
          ? `${cards.length} card${cards.length === 1 ? "" : "s"} on the old ${kind === "tasks" ? "task" : "app development"} board are not linked to any client. Move each onto a project so it appears on that client's page.`
          : `${cards.length} outreach card${cards.length === 1 ? "" : "s"} can become a client and a lead on Outreach.`}
      </p>
      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {cards.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{c.title}</p>
              <p className="text-xs text-slate-500">
                {[stageLabel(c.stage), c.assignee ? `assigned to ${c.assignee}` : null, c.phone, c.email, c.subtitle].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {moveToProject ? (
                <>
                  <select aria-label={`Project for ${c.title}`} className={select} value={pick[c.id] ?? ""} onChange={(e) => setPick({ ...pick, [c.id]: e.target.value })}>
                    <option value="">Choose a project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.companyName}: {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy !== "" || !pick[c.id]}
                    onClick={() =>
                      void run(c.id, async () => {
                        const res = await api<{ projectId: string }>("/api/legacy/tasks", { method: "POST", ...jsonBody({ cardId: c.id, projectId: pick[c.id], board: boardKey }) });
                        return `Moved "${c.title}" onto the project's task board (/projects/${res.projectId}).`;
                      })
                    }
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Move to project
                  </button>
                </>
              ) : (
                <button
                  disabled={busy !== ""}
                  onClick={() =>
                    void run(c.id, async () => {
                      const res = await api<{ companyId: string; reused: boolean }>("/api/legacy/outreach", { method: "POST", ...jsonBody({ cardId: c.id }) });
                      return `${res.reused ? "Linked to the existing client" : "Created client"} "${c.title}" (/crm/${res.companyId}).`;
                    })
                  }
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  Move to Sales
                </button>
              )}
              <button disabled={busy !== ""} onClick={() => discard(c)} className="text-xs text-rose-700 underline disabled:opacity-50">
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
      {moveToProject && projects.length === 0 ? (
        <p className="text-xs text-slate-500">
          There are no projects yet. Create one on the <Link href="/crm/projects" className="underline">Client projects</Link> page first.
        </p>
      ) : null}
    </div>
  );
}
