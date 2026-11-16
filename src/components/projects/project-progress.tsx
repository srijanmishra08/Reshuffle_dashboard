"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import type { Company } from "@/lib/crm-types";
import { deliveryStatuses, projectStatusStyles } from "@/lib/delivery-types";

export type ProgressRow = {
  id: string;
  name: string;
  status: string;
  companyId: string;
  companyName: string;
  budgetPaise: number;
  startDate: string | null;
  dueDate: string | null;
  tasksTotal: number;
  tasksDone: number;
  tasksOverdue: number;
  inReview: number;
  milestonesTotal: number;
  milestonesDone: number;
  progressPercent: number;
  overdue: boolean;
};

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";

export function ProgressBar({ percent, label: name }: { percent: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={name}>
        <div className={`h-full rounded-full ${percent >= 100 ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold text-slate-900">{percent}%</span>
    </div>
  );
}

function basis(p: ProgressRow) {
  if (p.tasksTotal > 0) return `${p.tasksDone} of ${p.tasksTotal} tasks`;
  if (p.milestonesTotal > 0) return `${p.milestonesDone} of ${p.milestonesTotal} milestones`;
  return "No tasks yet";
}

/**
 * Progress of every project, or of one client's projects when `companyId` is given.
 * Includes a form to start a project directly for a client.
 */
export function ProjectProgress({ companyId }: { companyId?: string }) {
  const [rows, setRows] = useState<ProgressRow[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ companyId: companyId ?? "", name: "", rupees: "", startDate: "", dueDate: "" });

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (companyId) params.set("companyId", companyId);
    try {
      setRows(await api<ProgressRow[]>(`/api/delivery-projects?${params}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load projects");
    }
  }, [status, companyId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (companyId) return;
    const timer = setTimeout(() => {
      api<Company[]>("/api/companies").then(setCompanies).catch(() => setError("Could not load clients"));
    }, 0);
    return () => clearTimeout(timer);
  }, [companyId]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const rupees = form.rupees === "" ? 0 : Number(form.rupees);
    if (!Number.isFinite(rupees) || rupees < 0) return setError("Budget must be zero or more.");
    setBusy(true);
    setError("");
    try {
      await api("/api/delivery-projects", {
        method: "POST",
        ...jsonBody({
          companyId: form.companyId,
          name: form.name,
          budgetPaise: Math.round(rupees * 100),
          startDate: form.startDate || null,
          dueDate: form.dueDate || null,
        }),
      });
      setForm({ companyId: companyId ?? "", name: "", rupees: "", startDate: "", dueDate: "" });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the project");
    } finally {
      setBusy(false);
    }
  }

  const live = (rows ?? []).filter((p) => p.status === "ACTIVE" || p.status === "PLANNED" || p.status === "ON_HOLD");
  const average = live.length ? Math.round(live.reduce((s, p) => s + p.progressPercent, 0) / live.length) : 0;
  const summary: [string, string][] = [
    ["Open projects", String(live.length)],
    ["Average progress", `${average}%`],
    ["Past due date", String(live.filter((p) => p.overdue).length)],
    ["Overdue tasks", String((rows ?? []).reduce((s, p) => s + p.tasksOverdue, 0))],
    ["Waiting on client", String((rows ?? []).reduce((s, p) => s + p.inReview, 0))],
  ];

  return (
    <div className="space-y-3">
      {!companyId ? (
        <div className="grid gap-3 sm:grid-cols-5">
          {summary.map(([name, value]) => (
            <div key={name} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">{name}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setOpen(!open)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          {open ? "Close" : "New project"}
        </button>
        {!companyId ? (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Filter by status">
            <option value="">All statuses</option>
            {deliveryStatuses.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {open ? (
        <form onSubmit={create} className="grid items-end gap-3 rounded-2xl border border-slate-300 bg-slate-50 p-4 md:grid-cols-5">
          {!companyId ? (
            <label className={label}>
              Client
              <select required className={input} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                <option value="">Choose…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={`${label} ${companyId ? "md:col-span-2" : ""}`}>
            Project name
            <input required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className={label}>
            Budget (₹, pre-GST)
            <input type="number" min="0" className={input} value={form.rupees} onChange={(e) => setForm({ ...form, rupees: e.target.value })} />
          </label>
          <label className={label}>
            Start
            <input type="date" className={input} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label className={label}>
            Due
            <input type="date" className={input} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </label>
          <div className="md:col-span-5">
            <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Create project
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Project</th>
              {!companyId ? <th className="px-3 py-2">Client</th> : null}
              <th className="px-3 py-2">Status</th>
              <th className="w-56 px-3 py-2">Progress</th>
              <th className="px-3 py-2">Needs attention</th>
              <th className="px-3 py-2 text-right">Budget</th>
              <th className="px-3 py-2">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-slate-500">Loading...</td>
              </tr>
            ) : null}
            {rows?.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">
                  <Link href={`/projects/${p.id}`} className="font-medium text-sky-700 hover:underline">
                    {p.name}
                  </Link>
                </td>
                {!companyId ? (
                  <td className="px-3 py-2">
                    <Link href={`/crm/${p.companyId}`} className="hover:underline">
                      {p.companyName}
                    </Link>
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${projectStatusStyles[p.status]}`}>{p.status.replace("_", " ")}</span>
                </td>
                <td className="px-3 py-2">
                  <ProgressBar percent={p.progressPercent} label={`${p.name} progress`} />
                  <p className="mt-0.5 text-xs text-slate-500">{basis(p)}</p>
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.tasksOverdue ? <p className="font-medium text-rose-600">{p.tasksOverdue} overdue task(s)</p> : null}
                  {p.inReview ? <p className="text-violet-700">{p.inReview} with client for review</p> : null}
                  {!p.tasksOverdue && !p.inReview ? <span className="text-slate-400">—</span> : null}
                </td>
                <td className="px-3 py-2 text-right">{formatINR(p.budgetPaise)}</td>
                <td className={`px-3 py-2 ${p.overdue ? "font-medium text-rose-600" : ""}`}>{p.dueDate ? `${p.dueDate}${p.overdue ? " (late)" : ""}` : "—"}</td>
              </tr>
            ))}
            {rows?.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  {companyId ? "No projects for this client yet. Start one with New project." : "No projects yet. Start one with New project, or convert a won deal on the Sales board."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
