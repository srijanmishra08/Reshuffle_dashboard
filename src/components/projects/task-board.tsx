"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import {
  type TaskPriorityName,
  type TaskStatusName,
  doneStatuses,
  taskPriorities,
  taskStatusLabels,
  taskStatuses,
} from "@/lib/schemas/project-tasks";

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatusName;
  priority: TaskPriorityName;
  dueDate: string | null;
  budgetPaise: number;
  assigneeId: string | null;
  assigneeName: string | null;
};
type Freelancer = { id: string; freelancer: string };
type Draft = { id: string | null; title: string; description: string; status: TaskStatusName; priority: TaskPriorityName; dueDate: string; rupees: string; assigneeId: string };

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";

const columnTone: Record<TaskStatusName, string> = {
  BACKLOG: "border-t-slate-400",
  TODO: "border-t-amber-400",
  IN_PROGRESS: "border-t-sky-500",
  CLIENT_REVIEW: "border-t-violet-500",
  REVISION: "border-t-orange-500",
  COMPLETED: "border-t-emerald-500",
  INVOICED: "border-t-rose-400",
};
const priorityTone: Record<TaskPriorityName, string> = {
  NONE: "",
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-rose-100 text-rose-800",
};

const blank = (status: TaskStatusName): Draft => ({ id: null, title: "", description: "", status, priority: "NONE", dueDate: "", rupees: "", assigneeId: "" });
const todayLocal = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Kanban board for one project. Cards can be dragged between columns or moved with the column picker in the editor. */
export function TaskBoard({ projectId, onChange }: { projectId: string; onChange?: () => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatusName | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Only the newest load may write state, so a slow response cannot undo a move.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const rows = await api<Task[]>(`/api/delivery-projects/${projectId}/tasks`);
      if (seq === loadSeq.current) setTasks(rows);
    } catch (e) {
      if (seq === loadSeq.current) setError(e instanceof Error ? e.message : "Could not load tasks");
    }
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      api<Freelancer[]>("/api/freelancers")
        .then(setFreelancers)
        .catch(() => setFreelancers([]));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function move(taskId: string, status: TaskStatusName) {
    const task = tasks?.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    const before = tasks;
    loadSeq.current++;
    setTasks((list) => (list ? [...list.filter((t) => t.id !== taskId), { ...task, status }] : list));
    setError("");
    try {
      await api(`/api/project-tasks/${taskId}`, { method: "PATCH", ...jsonBody({ status }) });
      onChange?.();
      await load();
    } catch (e) {
      setTasks(before ?? null);
      setError(e instanceof Error ? e.message : "Could not move the task");
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const rupees = draft.rupees === "" ? 0 : Number(draft.rupees);
    if (!Number.isFinite(rupees) || rupees < 0) return setError("Budget must be zero or more.");
    setBusy(true);
    setError("");
    const body = {
      title: draft.title,
      description: draft.description,
      status: draft.status,
      priority: draft.priority,
      dueDate: draft.dueDate || null,
      budgetPaise: Math.round(rupees * 100),
      assigneeId: draft.assigneeId,
    };
    try {
      if (draft.id) await api(`/api/project-tasks/${draft.id}`, { method: "PATCH", ...jsonBody(body) });
      else await api(`/api/delivery-projects/${projectId}/tasks`, { method: "POST", ...jsonBody(body) });
      setDraft(null);
      onChange?.();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the task");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(`Delete task "${draft.title}"?`)) return;
    setBusy(true);
    try {
      await api(`/api/project-tasks/${draft.id}`, { method: "DELETE" });
      setDraft(null);
      onChange?.();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the task");
    } finally {
      setBusy(false);
    }
  }

  const edit = (t: Task) =>
    setDraft({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ?? "",
      rupees: t.budgetPaise ? String(t.budgetPaise / 100) : "",
      assigneeId: t.assigneeId ?? "",
    });

  if (tasks === null) return <p className="text-sm text-slate-500">{error || "Loading tasks..."}</p>;

  const today = todayLocal();
  const done = tasks.filter((t) => doneStatuses.includes(t.status)).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-56 flex-1">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              {done} of {tasks.length} tasks done
            </span>
            <span className="font-semibold text-slate-900">{percent}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Task progress">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <button onClick={() => setDraft(blank("TODO"))} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Add task
        </button>
      </div>

      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}

      {draft ? (
        <form onSubmit={save} className="grid gap-3 rounded-2xl border border-slate-300 bg-slate-50 p-4 md:grid-cols-4">
          <label className={`${label} md:col-span-2`}>
            Task
            <input required autoFocus className={input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className={label}>
            Column
            <select className={input} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatusName })}>
              {taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {taskStatusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Priority
            <select className={input} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriorityName })}>
              {taskPriorities.map((p) => (
                <option key={p} value={p}>
                  {p === "NONE" ? "None" : p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} md:col-span-4`}>
            Details
            <textarea rows={2} className={input} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <label className={label}>
            Due
            <input type="date" className={input} value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
          </label>
          <label className={label}>
            Budget (₹)
            <input type="number" min="0" className={input} value={draft.rupees} onChange={(e) => setDraft({ ...draft, rupees: e.target.value })} />
          </label>
          <label className={`${label} md:col-span-2`}>
            Assigned to
            <select className={input} value={draft.assigneeId} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}>
              <option value="">Nobody</option>
              {freelancers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.freelancer}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {draft.id ? "Save task" : "Add task"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-slate-300 px-4 py-1.5 text-sm">
              Cancel
            </button>
            {draft.id ? (
              <button type="button" disabled={busy} onClick={remove} className="ml-auto text-sm text-rose-700 underline disabled:opacity-50">
                Delete task
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {taskStatuses.map((status) => {
          const cards = tasks.filter((t) => t.status === status);
          return (
            <section
              key={status}
              aria-label={taskStatusLabels[status]}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain") || dragging;
                if (id) void move(id, status);
              }}
              className={`w-60 shrink-0 rounded-xl border border-t-4 border-slate-200 p-2 ${columnTone[status]} ${over === status ? "bg-sky-50" : "bg-slate-50"}`}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{taskStatusLabels[status]}</h4>
                <span className="rounded-full bg-white px-2 text-xs text-slate-600">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map((t) => {
                  const late = Boolean(t.dueDate && t.dueDate < today && !doneStatuses.includes(t.status));
                  return (
                    <button
                      key={t.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(t.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => edit(t)}
                      className={`block w-full cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm hover:border-slate-400 ${dragging === t.id ? "opacity-50" : ""}`}
                    >
                      <span className="block text-sm font-medium text-slate-900">{t.title}</span>
                      {t.description ? <span className="mt-0.5 block text-xs text-slate-500 line-clamp-2">{t.description}</span> : null}
                      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        {t.priority !== "NONE" ? <span className={`rounded px-1.5 py-0.5 font-medium ${priorityTone[t.priority]}`}>{t.priority.charAt(0) + t.priority.slice(1).toLowerCase()}</span> : null}
                        {t.budgetPaise ? <span className="text-slate-600">{formatINR(t.budgetPaise)}</span> : null}
                        {t.dueDate ? <span className={late ? "font-medium text-rose-600" : "text-slate-500"}>{late ? "Overdue " : "Due "}{t.dueDate}</span> : null}
                        {t.assigneeName ? <span className="text-slate-500">· {t.assigneeName}</span> : null}
                      </span>
                    </button>
                  );
                })}
                <button type="button" onClick={() => setDraft(blank(status))} className="w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:border-slate-500 hover:text-slate-700">
                  + Add
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">Drag a card to another column, or open it and change the column.</p>
    </div>
  );
}
