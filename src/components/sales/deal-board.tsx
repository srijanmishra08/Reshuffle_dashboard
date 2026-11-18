"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import { canTransitionDeal, dealStageLabels, dealStageValues, leadSourceValues, type DealStage } from "@/server/models/deals";

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

export function DealBoard() {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [summary, setSummary] = useState<StageSummary[]>([]);
  const [error, setError] = useState("");
  const emptyForm = { name: "", source: "", referrer: "", title: "", rupees: "" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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
    const name = form.name.trim();
    setSaving(true);
    try {
      await api("/api/deals", {
        method: "POST",
        ...jsonBody({
          companyName: name,
          title: form.title.trim() || name,
          source: form.source,
          referrer: form.referrer,
          valuePaise: Math.round(Number(form.rupees || 0) * 100),
        }),
      });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/settings/modules" className="text-xs text-slate-500 underline">Manage module library</Link>
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs text-slate-500">
          Lead / client name
          <input
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Type any new name"
            className="mt-1 block w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Found through
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900">
            <option value="">Choose…</option>
            {leadSourceValues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Referred by (name)
          <input value={form.referrer} onChange={(e) => setForm({ ...form, referrer: e.target.value })} className="mt-1 block w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
        </label>
        <label className="text-xs text-slate-500">
          Deal title (optional)
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Defaults to the name" className="mt-1 block w-44 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
        </label>
        <label className="text-xs text-slate-500">
          Expected value (₹)
          <input type="number" min="0" value={form.rupees} onChange={(e) => setForm({ ...form, rupees: e.target.value })} className="mt-1 block w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" />
        </label>
        <button disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Adding…" : "Add lead"}</button>
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
                    <Link href={`/sales/${deal.id}`} className="font-medium text-slate-900 hover:underline">{deal.title}</Link>
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
