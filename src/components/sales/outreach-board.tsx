"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MailComposer } from "@/components/mail/mail-composer";
import { api, jsonBody } from "@/lib/api";
import { useStaff } from "@/lib/use-staff";
import { formatINR } from "@/server/lib/money";
import { canTransitionDeal, dealStageLabels, dealStageValues, type DealStage } from "@/server/models/deals";

type Lead = {
  id: string;
  companyId: string;
  title: string;
  stage: DealStage;
  valuePaise: number;
  companyName: string;
  temperature: string | null;
  source: string | null;
  referrer: string | null;
  nextFollowUp: string | null;
  ownerId: string | null;
  ownerName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  modules: { id: string; name: string }[];
};

/** Must match the default page size of `/api/deals`. */
const PAGE_CAP = 500;

const stageHints: Record<DealStage, string> = {
  LEAD: "Recorded, not contacted yet",
  CONTACTED: "First meeting held",
  DIAGNOSED: "Second meeting, budget discussed",
  PROPOSAL_SENT: "Strategy or scope sent",
  NEGOTIATION: "Waiting for their confirmation",
  WON: "Accepted",
  LOST: "Did not go ahead",
};

const stageTone: Record<DealStage, string> = {
  LEAD: "text-slate-700",
  CONTACTED: "text-sky-700",
  DIAGNOSED: "text-indigo-700",
  PROPOSAL_SENT: "text-amber-700",
  NEGOTIATION: "text-orange-700",
  WON: "text-emerald-700",
  LOST: "text-rose-700",
};

/** Today as YYYY-MM-DD in the browser's own calendar (follow-up dates are calendar days). */
function today(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function dueLabel(date: string | null, base: string, stage: DealStage): { text: string; tone: string } | null {
  if (!date || stage === "WON" || stage === "LOST") return null;
  if (date < base) return { text: "Overdue", tone: "bg-red-50 text-red-700" };
  if (date === base) return { text: "Due today", tone: "bg-amber-50 text-amber-700" };
  return null;
}

/**
 * Every lead and where it stands, one column per stage from the first contact to won or lost. Leads are recorded on the
 * Sales page; this is where they are followed up, emailed and moved along.
 */
export function OutreachBoard() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [base, setBase] = useState("");
  const [emailing, setEmailing] = useState("");
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(true);
  const { staff, currentUserId } = useStaff();
  const [view, setView] = useState<"all" | "mine" | string>("all");

  const load = useCallback(async () => {
    try {
      setLeads(await api<Lead[]>("/api/deals"));
      setBase(today());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leads");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    // Other people add and move leads too, so the board refreshes itself.
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  async function patch(lead: Lead, body: Record<string, unknown>, failure: string) {
    setSaving(lead.id);
    setError("");
    try {
      await api(`/api/deals/${lead.id}`, { method: "PATCH", ...jsonBody(body) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : failure);
    } finally {
      setSaving("");
    }
  }

  async function move(lead: Lead, to: DealStage) {
    let lostReason: string | undefined;
    if (to === "LOST") {
      const reason = window.prompt("Why was this lead lost?");
      if (!reason) return;
      lostReason = reason;
    }
    setSaving(lead.id);
    setError("");
    try {
      await api(`/api/deals/${lead.id}/transition`, { method: "POST", ...jsonBody({ to, lostReason }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the lead");
    } finally {
      setSaving("");
    }
  }

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (leads ?? []).filter((l) => {
      if (view !== "all" && l.ownerId !== (view === "mine" ? currentUserId : view)) return false;
      if (!showClosed && (l.stage === "WON" || l.stage === "LOST")) return false;
      if (!needle) return true;
      return [l.companyName, l.title, l.contactName, l.contactEmail].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [leads, view, currentUserId, showClosed, search]);

  if (!leads) return <p className="text-sm text-slate-500">{error || "Loading leads..."}</p>;

  const stages = dealStageValues.filter((s) => showClosed || (s !== "WON" && s !== "LOST"));
  const byStage = (stage: DealStage) =>
    visible
      .filter((l) => l.stage === stage)
      .sort((a, b) => (a.nextFollowUp ?? "9999").localeCompare(b.nextFollowUp ?? "9999") || a.companyName.localeCompare(b.companyName));
  const needAttention = visible.filter((l) => l.stage !== "WON" && l.stage !== "LOST" && l.nextFollowUp && l.nextFollowUp <= base).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {leads.length === 0 ? (
          <>No leads yet. Record one on <Link href="/sales" className="underline">Record sales</Link> and it shows up here.</>
        ) : (
          <>
            {visible.length} {visible.length === 1 ? "lead" : "leads"}
            {needAttention > 0 ? <> · <strong className="text-red-700">{needAttention} to follow up today or overdue</strong></> : null}. New leads come from{" "}
            <Link href="/sales" className="underline">Record sales</Link>.
          </>
        )}
      </p>
      {leads.length >= PAGE_CAP ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Showing the {PAGE_CAP} most recently changed leads. Older ones are hidden; search by name or ask for a larger limit.</p>
      ) : null}
      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-2">
          Show
          <select value={view} onChange={(e) => setView(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-900">
            <option value="all">Everyone&apos;s leads</option>
            <option value="mine">My leads</option>
            {staff.filter((m) => m.id !== currentUserId).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, title or email"
          className="w-56 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-900"
        />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show accepted and lost
        </label>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const cards = byStage(stage);
          const value = cards.reduce((sum, l) => sum + l.valuePaise, 0);
          return (
            <section key={stage} className="w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <header className="mb-2 px-1">
                <h3 className={`text-sm font-semibold ${stageTone[stage]}`}>
                  {dealStageLabels[stage]} <span className="font-normal text-slate-500">({cards.length})</span>
                </h3>
                <p className="text-xs text-slate-500">{stageHints[stage]}{value > 0 ? ` · ${formatINR(value)}` : ""}</p>
              </header>
              <div className="space-y-2">
                {cards.length === 0 ? <p className="px-1 py-2 text-xs text-slate-400">Nothing here.</p> : null}
                {cards.map((lead) => {
                  const due = dueLabel(lead.nextFollowUp, base, lead.stage);
                  const closed = lead.stage === "WON" || lead.stage === "LOST";
                  const targets = dealStageValues.filter((s) => s !== lead.stage && canTransitionDeal(lead.stage, s));
                  return (
                    <article key={lead.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/sales/${lead.id}`} className="font-medium text-slate-900 hover:underline">{lead.companyName}</Link>
                        {due ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${due.tone}`}>{due.text}</span> : null}
                      </div>
                      {lead.title !== lead.companyName ? <p className="text-xs text-slate-600">{lead.title}</p> : null}
                      <p className="text-xs text-slate-500">
                        {lead.valuePaise > 0 ? formatINR(lead.valuePaise) : "No value yet"}
                        {lead.temperature ? ` · ${lead.temperature.toLowerCase()}` : ""}
                      </p>
                      {lead.contactName || lead.contactEmail || lead.contactPhone ? (
                        <p className="mt-1 text-xs text-slate-600">
                          {[lead.contactName, lead.contactEmail, lead.contactPhone].filter(Boolean).join(" · ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-amber-700">No contact yet. <Link href={`/crm/${lead.companyId}`} className="underline">Add one</Link></p>
                      )}
                      <p className="text-xs text-slate-400">{lead.ownerName ? `Owner: ${lead.ownerName}` : "No owner"}</p>
                      {lead.source || lead.referrer ? (
                        <p className="text-xs text-slate-500">
                          {lead.source ?? "Source not set"}
                          {lead.referrer ? ` · referred by ${lead.referrer}` : ""}
                        </p>
                      ) : null}
                      {lead.modules.length > 0 ? (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {lead.modules.map((m) => (
                            <span key={m.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{m.name}</span>
                          ))}
                        </p>
                      ) : null}
                      {!closed ? (
                        <label className="mt-2 block text-xs text-slate-500">
                          Next follow-up
                          <input
                            type="date"
                            value={lead.nextFollowUp ?? ""}
                            disabled={saving === lead.id}
                            onChange={(e) => void patch(lead, { nextFollowUp: e.target.value || null }, "Could not save the follow-up date")}
                            className="mt-1 block w-full rounded border border-slate-300 px-1 py-1 text-xs text-slate-900"
                          />
                        </label>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        {targets.length > 0 ? (
                          <select
                            aria-label={`Move ${lead.companyName} to another stage`}
                            value=""
                            disabled={saving === lead.id}
                            onChange={(e) => e.target.value && void move(lead, e.target.value as DealStage)}
                            className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-1 text-xs text-slate-900"
                          >
                            <option value="">Move to…</option>
                            {targets.map((s) => (
                              <option key={s} value={s}>{dealStageLabels[s]}</option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setEmailing(emailing === lead.id ? "" : lead.id)}
                          className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Email
                        </button>
                      </div>
                      {emailing === lead.id ? (
                        <MailComposer
                          kind="OUTREACH"
                          companyId={lead.companyId}
                          dealId={lead.id}
                          defaultTo={lead.contactEmail ?? ""}
                          defaultSubject={lead.title}
                          defaultBody={`Hello${lead.contactName ? ` ${lead.contactName}` : ""},\n\nI wanted to follow up on ${lead.title}.\n\nThanks`}
                          onClose={() => setEmailing("")}
                          onSent={() => void load()}
                        />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
