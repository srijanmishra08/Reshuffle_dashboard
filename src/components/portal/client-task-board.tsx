"use client";

import { useState } from "react";
import { ReviewActions } from "@/components/portal/review-actions";
import { TaskComments, type PortalComment } from "@/components/portal/task-comments";
import type { TaskStatusName } from "@/lib/schemas/project-tasks";

export type BoardTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  comments: PortalComment[];
};

/** The client sees five columns. Backlog counts as To do, and invoiced work counts as completed. */
const columns: { key: string; title: string; statuses: TaskStatusName[]; tone: string }[] = [
  { key: "todo", title: "To do", statuses: ["BACKLOG", "TODO"], tone: "border-t-amber-400" },
  { key: "progress", title: "In progress", statuses: ["IN_PROGRESS"], tone: "border-t-sky-500" },
  { key: "review", title: "Waiting for you", statuses: ["CLIENT_REVIEW"], tone: "border-t-violet-500" },
  { key: "revision", title: "Changes requested", statuses: ["REVISION"], tone: "border-t-orange-500" },
  { key: "done", title: "Completed", statuses: ["COMPLETED", "INVOICED"], tone: "border-t-emerald-500" },
];

const priorityTone: Record<string, string> = { LOW: "bg-stone-100 text-stone-700", MEDIUM: "bg-amber-100 text-amber-800", HIGH: "bg-rose-100 text-rose-800" };
const day = (value: string) => new Date(`${value}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/**
 * The project's task board as the client sees it. Cards are not draggable: the team moves work along, and the client
 * answers on cards in the Waiting for you column. Any card opens its comments.
 */
export function ClientTaskBoard({ tasks, today, readOnly = false }: { tasks: BoardTask[]; today: string; readOnly?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map((col) => {
        const cards = tasks.filter((t) => (col.statuses as string[]).includes(t.status));
        return (
          <section key={col.key} aria-label={col.title} className={`w-64 shrink-0 rounded-xl border border-t-4 border-stone-200 bg-stone-50 p-2 ${col.tone}`}>
            <div className="flex items-center justify-between px-1 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-700">{col.title}</h3>
              <span className="rounded-full bg-white px-2 text-xs text-stone-600">{cards.length}</span>
            </div>
            <div className="space-y-2">
              {cards.length === 0 ? <p className="px-1 py-3 text-xs text-stone-400">Nothing here</p> : null}
              {cards.map((t) => {
                const late = Boolean(t.dueDate && t.dueDate < today && col.key !== "done");
                const expanded = open === t.id;
                return (
                  <article key={t.id} className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
                    <p className="text-sm font-medium text-stone-900">{t.title}</p>
                    {t.description ? <p className={`mt-0.5 text-xs text-stone-600 ${expanded ? "" : "line-clamp-2"}`}>{t.description}</p> : null}
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      {t.priority in priorityTone ? <span className={`rounded px-1.5 py-0.5 font-medium ${priorityTone[t.priority]}`}>{t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}</span> : null}
                      {t.dueDate ? <span className={late ? "font-medium text-rose-600" : "text-stone-500"}>{late ? "Late, due " : "Due "}{day(t.dueDate)}</span> : null}
                    </p>
                    {t.status === "CLIENT_REVIEW" ? (
                      <div className="mt-3 border-t border-stone-100 pt-3">
                        <ReviewActions taskId={t.id} readOnly={readOnly} />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : t.id)}
                      className="mt-3 text-xs font-medium text-stone-600 underline"
                    >
                      {expanded ? "Hide comments" : t.comments.length > 0 ? `Comments (${t.comments.length})` : "Comment"}
                    </button>
                    {expanded ? (
                      <div className="mt-2">
                        <TaskComments taskId={t.id} area="client" comments={t.comments} readOnly={readOnly} />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
