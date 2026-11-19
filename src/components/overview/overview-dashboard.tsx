"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { pollWhileVisible } from "@/lib/poll";
import { formatINR } from "@/server/lib/money";
import { KpiGrid } from "@/components/kpi-grid";
import { dealStageLabels, type DealStage } from "@/server/models/deals";
import type { DashboardKpi } from "@/lib/types";

type Overview = {
  month: string;
  pipeline: {
    stages: { stage: DealStage; count: number; valuePaise: number }[];
    openCount: number;
    openValuePaise: number;
    wonThisMonthCount: number;
    wonThisMonthPaise: number;
    winRatePercent: number | null;
  };
  receivables: { outstandingPaise: number; openCount: number; overduePaise: number; overdueCount: number };
  clients: { active: number };
  projects: { active: number; onHold: number; atRisk: number; tasksOverdue: number; inClientReview: number };
  cash: { incomePaise: number; expensePaise: number };
  followUps: { id: string; kind: "TOUCH" | "LEAD"; companyId: string; companyName: string; href: string; nextAction: string | null; nextActionAt: string | null; allDay: boolean }[];
  meetings: { id: string; title: string; at: string; companyId: string | null; companyName: string | null }[];
  activity: { id: string; action: string; module: string; entityType: string; createdAt: string }[];
};

const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const heading = "text-xs font-semibold uppercase tracking-[0.14em] text-slate-500";
const dayOnly = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export function OverviewDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Overview>("/api/overview")
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError("");
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load overview"));
    const first = setTimeout(load, 0);
    const stop = pollWhileVisible(load, 120_000);
    return () => {
      alive = false;
      clearTimeout(first);
      stop();
    };
  }, []);

  if (!data) return <p className="text-sm text-slate-500">{error || "Loading..."}</p>;

  const net = data.cash.incomePaise - data.cash.expensePaise;
  const kpis: DashboardKpi[] = [
    {
      title: "Open pipeline",
      value: formatINR(data.pipeline.openValuePaise),
      trend: `${data.pipeline.openCount} open deals`,
      tone: "neutral",
    },
    {
      title: "Won this month",
      value: formatINR(data.pipeline.wonThisMonthPaise),
      trend:
        data.pipeline.winRatePercent === null
          ? `${data.pipeline.wonThisMonthCount} deals`
          : `${data.pipeline.wonThisMonthCount} deals · ${data.pipeline.winRatePercent}% win rate`,
      tone: data.pipeline.wonThisMonthCount > 0 ? "good" : "neutral",
    },
    {
      title: "Receivables",
      value: formatINR(data.receivables.outstandingPaise),
      trend:
        data.receivables.overdueCount > 0
          ? `${formatINR(data.receivables.overduePaise)} overdue (${data.receivables.overdueCount})`
          : `${data.receivables.openCount} open invoices`,
      tone: data.receivables.overdueCount > 0 ? "warn" : "good",
    },
    {
      title: "Cash this month",
      value: formatINR(net),
      trend: `In ${formatINR(data.cash.incomePaise)} · out ${formatINR(data.cash.expensePaise)}`,
      tone: net >= 0 ? "good" : "warn",
    },
    { title: "Active clients", value: String(data.clients.active), trend: "Onboarding, active, maintenance", tone: "neutral" },
    {
      title: "Active projects",
      value: String(data.projects.active),
      trend:
        data.projects.atRisk > 0 || data.projects.tasksOverdue > 0
          ? [data.projects.atRisk > 0 ? `${data.projects.atRisk} with late milestones` : "", data.projects.tasksOverdue > 0 ? `${data.projects.tasksOverdue} overdue tasks` : ""].filter(Boolean).join(" · ")
          : data.projects.inClientReview > 0
            ? `${data.projects.inClientReview} tasks with clients for review`
            : `${data.projects.onHold} on hold`,
      tone: data.projects.atRisk > 0 || data.projects.tasksOverdue > 0 ? "warn" : "good",
    },
  ];

  const maxStage = Math.max(1, ...data.pipeline.stages.map((s) => s.valuePaise));

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <KpiGrid items={kpis} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-center justify-between">
            <h3 className={heading}>Pipeline by stage</h3>
            <Link href="/outreach" className="text-xs text-slate-600 underline">Open outreach</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {data.pipeline.stages.map((s) => (
              <li key={s.stage} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-700">
                    {dealStageLabels[s.stage]} <span className="text-slate-400">({s.count})</span>
                  </span>
                  <span className="font-medium text-slate-900">{formatINR(s.valuePaise)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-slate-800" style={{ width: `${(s.valuePaise / maxStage) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <div className="flex items-center justify-between">
            <h3 className={heading}>Follow-ups due this week</h3>
            <span className="flex gap-3 text-xs text-slate-600">
              <Link href="/outreach" className="underline">Outreach</Link>
              <Link href="/crm" className="underline">Clients</Link>
            </span>
          </div>
          {data.followUps.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing due.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.followUps.map((f) => (
                <li key={f.id} className="flex justify-between gap-3">
                  <Link href={f.href} className="text-slate-800 hover:underline">
                    <span className="font-medium">{f.companyName}</span>
                    {f.nextAction ? `: ${f.nextAction}` : ""}
                  </Link>
                  <span className="shrink-0 text-xs text-slate-500">{f.allDay && f.nextActionAt ? dayOnly(f.nextActionAt) : day(f.nextActionAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card}>
          <h3 className={heading}>Meetings in the next 7 days</h3>
          {data.meetings.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No meetings scheduled.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.meetings.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span className="text-slate-800">
                    <span className="font-medium">{m.title}</span>
                    {m.companyName ? ` · ${m.companyName}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{day(m.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card}>
          <h3 className={heading}>Recent activity</h3>
          {data.activity.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span className="text-slate-800">
                    {a.action} <span className="text-slate-400">· {a.module}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{day(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
