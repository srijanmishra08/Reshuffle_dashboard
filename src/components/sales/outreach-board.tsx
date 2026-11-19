"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MailComposer } from "@/components/mail/mail-composer";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import { useStaff } from "@/lib/use-staff";
import { dealStageLabels, openDealStages, type DealStage } from "@/server/models/deals";

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
  modules: { id: string; name: string }[];
};

const open: readonly string[] = openDealStages;
const dayMs = 24 * 60 * 60 * 1000;

/** Today as YYYY-MM-DD in the browser's own calendar (follow-up dates are calendar days). */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysFrom(date: string, base: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / dayMs);
}

const lanes = [
  { key: "overdue", title: "Overdue", hint: "Follow-up date has passed", tone: "text-rose-700" },
  { key: "soon", title: "Today and next 7 days", hint: "Coming up", tone: "text-amber-700" },
  { key: "later", title: "Later", hint: "More than a week away", tone: "text-slate-700" },
  { key: "none", title: "No follow-up date", hint: "Set one so it does not get forgotten", tone: "text-slate-700" },
] as const;

function laneOf(lead: Lead, base: string): (typeof lanes)[number]["key"] {
  if (!lead.nextFollowUp) return "none";
  const days = daysFrom(lead.nextFollowUp, base);
  if (days < 0) return "overdue";
  return days <= 7 ? "soon" : "later";
}

/**
 * Client outreach: every lead that is still open on the Sales board, sorted into what needs a follow-up first.
 * It reads the same deals as Sales, so a lead added there appears here at once, with the sales node that found it.
 */
export function OutreachBoard() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [emailing, setEmailing] = useState("");
  const [base, setBase] = useState("");
  const { staff, currentUserId } = useStaff();
  const [view, setView] = useState<"all" | "mine" | string>("all");

  const load = useCallback(async () => {
    try {
      const rows = await api<Lead[]>("/api/deals");
      setLeads(rows.filter((l) => open.includes(l.stage)));
      setBase(today());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leads");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function setFollowUp(lead: Lead, date: string) {
    setSaving(lead.id);
    setError("");
    try {
      await api(`/api/deals/${lead.id}`, { method: "PATCH", ...jsonBody({ nextFollowUp: date || null }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the follow-up date");
    } finally {
      setSaving("");
    }
  }

  if (!leads) return <p className="text-sm text-slate-500">{error || "Loading leads..."}</p>;

  const visible = leads.filter((l) => view === "all" || l.ownerId === (view === "mine" ? currentUserId : view));
  const byLane = (key: string) =>
    visible
      .filter((l) => laneOf(l, base) === key)
      .sort((a, b) => (a.nextFollowUp ?? "9999").localeCompare(b.nextFollowUp ?? "9999") || a.companyName.localeCompare(b.companyName));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {leads.length === 0 ? (
          <>No open leads. Add one on the <Link href="/sales" className="underline">Sales board</Link> and it shows up here.</>
        ) : (
          <>{leads.length} open {leads.length === 1 ? "lead" : "leads"}. Set a follow-up date on each; open a lead to change its stage or log a meeting.</>
        )}
      </p>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <label className="flex items-center gap-2 text-xs text-slate-500">
        Show
        <select value={view} onChange={(e) => setView(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-900">
          <option value="all">Everyone&apos;s leads</option>
          <option value="mine">My leads</option>
          {staff.filter((m) => m.id !== currentUserId).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {lanes.map((lane) => {
          const cards = byLane(lane.key);
          return (
            <section key={lane.key} className="w-72 shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <header className="mb-2 px-1">
                <h3 className={`text-sm font-semibold ${lane.tone}`}>{lane.title} <span className="font-normal text-slate-500">({cards.length})</span></h3>
                <p className="text-xs text-slate-500">{lane.hint}</p>
              </header>
              <div className="space-y-2">
                {cards.map((lead) => (
                  <article key={lead.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                    <Link href={`/sales/${lead.id}`} className="font-medium text-slate-900 hover:underline">{lead.companyName}</Link>
                    <p className="text-xs text-slate-500">
                      {dealStageLabels[lead.stage]}
                      {lead.valuePaise > 0 ? ` · ${formatINR(lead.valuePaise)}` : ""}
                      {lead.temperature ? ` · ${lead.temperature.toLowerCase()}` : ""}
                    </p>
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
                    <label className="mt-2 block text-xs text-slate-500">
                      Next follow-up
                      <input
                        type="date"
                        value={lead.nextFollowUp ?? ""}
                        disabled={saving === lead.id}
                        onChange={(e) => void setFollowUp(lead, e.target.value)}
                        className="mt-1 block w-full rounded border border-slate-300 px-1 py-1 text-xs text-slate-900"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setEmailing(emailing === lead.id ? "" : lead.id)}
                      className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Email
                    </button>
                    {emailing === lead.id ? (
                      <MailComposer
                        kind="OUTREACH"
                        companyId={lead.companyId}
                        dealId={lead.id}
                        defaultSubject={`${lead.title}`}
                        defaultBody={`Hello,\n\nI wanted to follow up on ${lead.title}.\n\nThanks`}
                        onClose={() => setEmailing("")}
                        onSent={() => void load()}
                      />
                    ) : null}
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
