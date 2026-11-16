"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";

type Assignment = {
  id: string;
  projectId: string;
  projectName: string;
  role: string;
  allocationPct: number;
  startDate: string | null;
  endDate: string | null;
  status: "ACTIVE" | "ENDED";
};
type Payout = {
  id: string;
  projectName: string | null;
  description: string;
  amountPaise: number;
  dueDate: string | null;
  paidOn: string | null;
  status: "PENDING" | "PAID" | "CANCELLED";
};
type View = {
  freelancer: {
    id: string;
    name: string;
    skill: string | null;
    category: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    availability: string | null;
  };
  assignments: Assignment[];
  utilizationPct: number;
  payouts: Payout[];
  pendingPaise: number;
  paidPaise: number;
};
type ProjectOption = { id: string; name: string };

const input = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";
const card = "rounded-2xl border border-slate-200 bg-white p-4";
const th = "px-3 py-2";

export function FreelancerDetail({ id }: { id: string }) {
  const [view, setView] = useState<View | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [assign, setAssign] = useState({ projectId: "", role: "", allocationPct: "100", startDate: "" });
  const [pay, setPay] = useState({ projectId: "", description: "", rupees: "", dueDate: "" });

  const load = useCallback(async () => {
    try {
      setView(await api<View>(`/api/freelancers/${id}/team`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load freelancer");
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      api<ProjectOption[]>("/api/delivery-projects")
        .then(setProjects)
        .catch(() => setError("Could not load projects"));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function addAssignment(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api(`/api/freelancers/${id}/assignments`, {
        method: "POST",
        ...jsonBody({
          projectId: assign.projectId,
          role: assign.role,
          allocationPct: Math.round(Number(assign.allocationPct || 100)),
          startDate: assign.startDate || null,
        }),
      });
      setAssign({ projectId: "", role: "", allocationPct: "100", startDate: "" });
    });
  }

  function addPayout(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      const rupees = Number(pay.rupees);
      if (!Number.isFinite(rupees) || rupees <= 0) throw new Error("Enter an amount above zero");
      await api(`/api/freelancers/${id}/payouts`, {
        method: "POST",
        ...jsonBody({
          projectId: pay.projectId || null,
          description: pay.description,
          amountPaise: Math.round(rupees * 100),
          dueDate: pay.dueDate || null,
        }),
      });
      setPay({ projectId: "", description: "", rupees: "", dueDate: "" });
    });
  }

  if (!view) return <p className="text-sm text-slate-500">{error || "Loading..."}</p>;
  const f = view.freelancer;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/freelancers" className="text-xs text-slate-500 hover:underline">
          ← All freelancers
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{f.name}</h2>
        <p className="text-sm text-slate-500">
          {[f.skill, f.category, f.company, f.email, f.phone].filter(Boolean).join(" · ") || "No profile details yet"}
        </p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={card}>
          <p className={label}>Utilization (active assignments)</p>
          <p className={`mt-1 text-2xl font-bold ${view.utilizationPct > 100 ? "text-rose-600" : "text-slate-900"}`}>
            {view.utilizationPct}%
          </p>
        </div>
        <div className={card}>
          <p className={label}>Payouts pending</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatINR(view.pendingPaise)}</p>
        </div>
        <div className={card}>
          <p className={label}>Paid to date</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatINR(view.paidPaise)}</p>
        </div>
      </div>

      <section className={card}>
        <h3 className="text-sm font-semibold text-slate-800">Assignments</h3>
        <form onSubmit={addAssignment} className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_1fr_6rem_9rem_auto]">
          <label className={label}>
            Project
            <select required value={assign.projectId} onChange={(e) => setAssign({ ...assign, projectId: e.target.value })} className={input}>
              <option value="">Choose…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Role
            <input value={assign.role} onChange={(e) => setAssign({ ...assign, role: e.target.value })} className={input} />
          </label>
          <label className={label}>
            Allocation %
            <input type="number" min="1" max="100" value={assign.allocationPct} onChange={(e) => setAssign({ ...assign, allocationPct: e.target.value })} className={input} />
          </label>
          <label className={label}>
            Start
            <input type="date" value={assign.startDate} onChange={(e) => setAssign({ ...assign, startDate: e.target.value })} className={input} />
          </label>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Assign
          </button>
        </form>
        {projects.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No delivery projects yet. Convert a won deal to create one.</p>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className={th}>Project</th>
                <th className={th}>Role</th>
                <th className={th}>Allocation</th>
                <th className={th}>Dates</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {view.assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-slate-500">Not assigned to any project.</td>
                </tr>
              ) : null}
              {view.assignments.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className={th}>
                    <Link href={`/projects/${a.projectId}`} className="font-medium text-slate-900 hover:underline">
                      {a.projectName}
                    </Link>
                  </td>
                  <td className={th}>{a.role || "—"}</td>
                  <td className={th}>{a.allocationPct}%</td>
                  <td className={th}>
                    {a.startDate ?? "—"} to {a.endDate ?? "—"}
                  </td>
                  <td className={th}>{a.status}</td>
                  <td className={`${th} text-right`}>
                    {a.status === "ACTIVE" ? (
                      <button
                        disabled={busy}
                        onClick={() => run(() => api(`/api/assignments/${a.id}`, { method: "PATCH", ...jsonBody({ status: "ENDED" }) }))}
                        className="text-xs text-slate-700 underline"
                      >
                        End
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h3 className="text-sm font-semibold text-slate-800">Payouts</h3>
        <form onSubmit={addPayout} className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_1fr_8rem_9rem_auto]">
          <label className={label}>
            Description
            <input value={pay.description} onChange={(e) => setPay({ ...pay, description: e.target.value })} className={input} />
          </label>
          <label className={label}>
            Project (optional)
            <select value={pay.projectId} onChange={(e) => setPay({ ...pay, projectId: e.target.value })} className={input}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Amount (₹)
            <input required type="number" min="1" value={pay.rupees} onChange={(e) => setPay({ ...pay, rupees: e.target.value })} className={input} />
          </label>
          <label className={label}>
            Due
            <input type="date" value={pay.dueDate} onChange={(e) => setPay({ ...pay, dueDate: e.target.value })} className={input} />
          </label>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Add payout
          </button>
        </form>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className={th}>Description</th>
                <th className={th}>Project</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>Due</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {view.payouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-slate-500">No payouts yet.</td>
                </tr>
              ) : null}
              {view.payouts.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className={th}>{p.description || "—"}</td>
                  <td className={th}>{p.projectName ?? "—"}</td>
                  <td className={`${th} text-right`}>{formatINR(p.amountPaise)}</td>
                  <td className={th}>{p.dueDate ?? "—"}</td>
                  <td className={th}>{p.status === "PAID" ? `PAID ${p.paidOn ?? ""}` : p.status}</td>
                  <td className={`${th} text-right text-xs`}>
                    {p.status === "PENDING" ? (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Mark ${formatINR(p.amountPaise)} as paid? This books an expense in the ledger.`)) {
                              void run(() => api(`/api/payouts/${p.id}/pay`, { method: "POST", ...jsonBody({}) }));
                            }
                          }}
                          className="mr-3 font-medium text-emerald-700 underline"
                        >
                          Mark paid
                        </button>
                        <button disabled={busy} onClick={() => run(() => api(`/api/payouts/${p.id}/cancel`, { method: "POST" }))} className="text-slate-600 underline">
                          Cancel
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
