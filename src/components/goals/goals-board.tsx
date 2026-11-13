"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "DROPPED"] as const;
type Status = (typeof STATUSES)[number];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type Goal = {
  id: string;
  month: string;
  title: string;
  team: string | null;
  priority: (typeof PRIORITIES)[number];
  status: Status;
  dueDate: string | null;
};

const LABEL: Record<Status, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done", DROPPED: "Dropped" };

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function GoalsBoard() {
  const [month, setMonth] = useState(currentMonth);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [team, setTeam] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const data = await api<Goal[]>(`/api/goals?month=${encodeURIComponent(month)}`);
      if (mine === request.current) setGoals(data);
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : "Could not load goals");
    }
  }, [month]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/goals", {
        method: "POST",
        ...jsonBody({ month, title, team, priority, dueDate: dueDate || null }),
      });
      setTitle("");
      setDueDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add goal");
    }
  }

  async function move(id: string, status: Status) {
    setError("");
    try {
      await api(`/api/goals/${id}`, { method: "PATCH", ...jsonBody({ status }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update goal");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this goal?")) return;
    try {
      await api(`/api/goals/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete goal");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Month</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <form onSubmit={add} className="flex flex-1 flex-wrap items-end gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New goal" required className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Team" className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
        </form>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((status) => {
          const items = goals.filter((g) => g.status === status);
          return (
            <section key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {LABEL[status]} ({items.length})
              </h3>
              <ul className="space-y-2">
                {items.map((g) => (
                  <li key={g.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                    <p className="font-medium">{g.title}</p>
                    <p className="text-xs text-slate-500">
                      {[g.team, g.priority, g.dueDate && `due ${g.dueDate}`].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        aria-label="Move goal"
                        value={g.status}
                        onChange={(e) => void move(g.id, e.target.value as Status)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                      </select>
                      <button onClick={() => void remove(g.id)} className="text-xs text-rose-700 underline">Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
