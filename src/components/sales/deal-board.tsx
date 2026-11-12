"use client";

import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import { canTransitionDeal, dealStageLabels, dealStageValues, type DealStage } from "@/server/models/deals";

type DealRow = {
  id: string;
  title: string;
  stage: DealStage;
  valuePaise: number;
  companyName: string;
  temperature: string | null;
  nextFollowUp: string | null;
};
type StageSummary = { stage: DealStage; count: number; valuePaise: number };
type CompanyOption = { id: string; name: string };

export function DealBoard() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [summary, setSummary] = useState<StageSummary[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ companyId: "", title: "", rupees: "" });

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api<DealRow[]>("/api/deals"), api<StageSummary[]>("/api/deals/summary")]);
      setDeals(d);
      setSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load deals");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      api<CompanyOption[]>("/api/companies").then(setCompanies).catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function move(deal: DealRow, to: DealStage) {
    setError("");
    let lostReason: string | undefined;
    if (to === "LOST") {
      const reason = window.prompt("Why was this deal lost?");
      if (!reason) return;
      lostReason = reason;
    }
    try {
      await api(`/api/deals/${deal.id}/transition`, { method: "POST", ...jsonBody({ to, lostReason }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move deal");
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/deals", {
        method: "POST",
        ...jsonBody({
          companyId: form.companyId,
          title: form.title,
          valuePaise: Math.round(Number(form.rupees || 0) * 100),
        }),
      });
      setForm({ companyId: "", title: "", rupees: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create deal");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs text-slate-500">
          Company
          <select required value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
            <option value="">Choose…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Deal title
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
        </label>
        <label className="text-xs text-slate-500">
          Value (₹)
          <input type="number" min="0" value={form.rupees} onChange={(e) => setForm({ ...form, rupees: e.target.value })} className="mt-1 block w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
        </label>
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add deal</button>
      </form>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {dealStageValues.map((stage) => {
          const stats = summary.find((s) => s.stage === stage);
          const cards = deals.filter((d) => d.stage === stage);
          return (
            <section key={stage} className="w-64 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <header className="mb-2 px-1">
                <h3 className="text-sm font-semibold text-slate-800">{dealStageLabels[stage]}</h3>
                <p className="text-xs text-slate-500">{stats?.count ?? 0} deals · {formatINR(stats?.valuePaise ?? 0)}</p>
              </header>
              <div className="space-y-2">
                {cards.map((deal) => (
                  <article key={deal.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                    <p className="font-medium text-slate-900">{deal.title}</p>
                    <p className="text-xs text-slate-500">{deal.companyName} · {formatINR(deal.valuePaise)}</p>
                    <select
                      aria-label={`Move ${deal.title}`}
                      value=""
                      onChange={(e) => e.target.value && move(deal, e.target.value as DealStage)}
                      className="mt-2 w-full rounded border border-slate-300 px-1 py-1 text-xs"
                    >
                      <option value="">Move to…</option>
                      {dealStageValues.filter((s) => canTransitionDeal(deal.stage, s)).map((s) => (
                        <option key={s} value={s}>{dealStageLabels[s]}</option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
