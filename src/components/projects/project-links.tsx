"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";

type Hub = {
  project: { id: string; name: string; companyId: string; companyName: string };
  deal: { id: string; title: string; stage: string } | null;
  scope: { id: string; dealId: string; number: string | null; title: string; status: string } | null;
  team: { id: string; freelancerId: string; name: string; role: string; allocationPct: number; status: "ACTIVE" | "ENDED" }[];
  invoices: { id: string; number: string | null; status: string; totalPaise: number; paidPaise: number }[];
  workOrders: { id: string; number: string | null; status: string }[];
  moneyHidden: boolean;
};
type Freelancer = { id: string; freelancer: string };

const card = "rounded-2xl border border-slate-200 bg-white p-4";
const input = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const pill = "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700";
const label = (s: string) => s.replace(/_/g, " ").toLowerCase();

/** Where a project came from and what is attached to it: client, deal, proposal, team, invoices and work orders. */
export function ProjectLinks({ projectId }: { projectId: string }) {
  const [hub, setHub] = useState<Hub | null>(null);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [pick, setPick] = useState({ freelancerId: "", role: "", allocationPct: "50" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setHub(await api<Hub>(`/api/delivery-projects/${projectId}/hub`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load links");
    }
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      api<Freelancer[]>("/api/freelancers").then(setFreelancers).catch(() => setFreelancers([]));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function assign(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/freelancers/${pick.freelancerId}/assignments`, {
        method: "POST",
        ...jsonBody({ projectId, role: pick.role, allocationPct: Math.round(Number(pick.allocationPct) || 100) }),
      });
      setPick({ freelancerId: "", role: "", allocationPct: "50" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign the freelancer");
    } finally {
      setBusy(false);
    }
  }

  if (!hub) return error ? <p className="text-sm text-rose-600">{error}</p> : null;
  const onTeam = new Set(hub.team.filter((t) => t.status === "ACTIVE").map((t) => t.freelancerId));

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/crm/${hub.project.companyId}`} className="rounded-xl border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
          Client: {hub.project.companyName}
        </Link>
        {hub.deal ? (
          <Link href={`/sales/${hub.deal.id}`} className="rounded-xl border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Deal: {hub.deal.title}
          </Link>
        ) : null}
        {hub.scope ? (
          <Link href={`/sales/${hub.scope.dealId}/scopes/${hub.scope.id}`} className="rounded-xl border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Proposal: {hub.scope.number ?? hub.scope.title}
          </Link>
        ) : null}
        {!hub.deal && !hub.scope ? <span className="self-center text-xs text-slate-500">Created directly for the client, not from a deal.</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h3 className="text-sm font-semibold text-slate-800">Team</h3>
          {hub.team.length === 0 ? <p className="mt-2 text-sm text-slate-500">No freelancers assigned yet.</p> : null}
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {hub.team.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/freelancers/${t.freelancerId}`} className="font-medium text-slate-900 hover:underline">{t.name}</Link>
                <span className="flex items-center gap-2 text-slate-600">
                  {t.role || "Team member"} · {t.allocationPct}%
                  <span className={pill}>{t.status === "ACTIVE" ? "active" : "ended"}</span>
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={assign} className="mt-3 flex flex-wrap items-end gap-2">
            <select required aria-label="Freelancer" className={input} value={pick.freelancerId} onChange={(e) => setPick({ ...pick, freelancerId: e.target.value })}>
              <option value="">Assign a freelancer…</option>
              {freelancers
                .filter((f) => !onTeam.has(f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.freelancer}
                  </option>
                ))}
            </select>
            <input aria-label="Role" placeholder="Role" className={`${input} w-32`} value={pick.role} onChange={(e) => setPick({ ...pick, role: e.target.value })} />
            <input aria-label="Allocation percent" type="number" min="1" max="100" className={`${input} w-20`} value={pick.allocationPct} onChange={(e) => setPick({ ...pick, allocationPct: e.target.value })} />
            <button disabled={busy || !pick.freelancerId} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              Assign
            </button>
          </form>
        </section>

        {hub.moneyHidden ? null : (
          <section className={card}>
            <h3 className="text-sm font-semibold text-slate-800">Invoices and work orders</h3>
            {hub.invoices.length === 0 && hub.workOrders.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing billed yet. Use Draft invoice on a milestone below.</p>
            ) : null}
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {hub.invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/invoices/${i.id}`} className="font-medium text-slate-900 hover:underline">{i.number ?? "Draft invoice"}</Link>
                  <span className="flex items-center gap-2 text-slate-600">
                    {formatINR(i.totalPaise)}
                    <span className={pill}>{label(i.status)}</span>
                  </span>
                </li>
              ))}
              {hub.workOrders.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/work-orders/${w.id}`} className="font-medium text-slate-900 hover:underline">{w.number ?? "Draft work order"}</Link>
                  <span className={pill}>{label(w.status)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
