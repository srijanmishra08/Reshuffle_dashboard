"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR } from "@/server/lib/money";

type Overview = {
  pipeline: { openCount: number; openValuePaise: number; wonThisMonthCount: number; wonThisMonthPaise: number; winRatePercent: number | null };
  receivables: { outstandingPaise: number; openCount: number; overduePaise: number; overdueCount: number };
  clients: { active: number };
  projects: { active: number; onHold: number; atRisk: number; tasksOverdue: number; inClientReview: number };
  cash: { incomePaise: number; expensePaise: number };
  followUps: unknown[];
  meetings: unknown[];
};

type Figure = { label: string; value: string; note?: string; warn?: boolean };

/** A few live numbers for a department, taken from the same data as the Overview page. Departments with no numbers show nothing. */
function figuresFor(key: string, o: Overview): Figure[] {
  switch (key) {
    case "sales":
      return [
        { label: "Open pipeline", value: formatINR(o.pipeline.openValuePaise), note: `${o.pipeline.openCount} open deals` },
        { label: "Won this month", value: formatINR(o.pipeline.wonThisMonthPaise), note: `${o.pipeline.wonThisMonthCount} deals` },
        { label: "Win rate", value: o.pipeline.winRatePercent === null ? "—" : `${o.pipeline.winRatePercent}%`, note: "Won of all closed deals" },
      ];
    case "crm":
      return [
        { label: "Active clients", value: String(o.clients.active) },
        { label: "Follow-ups due", value: String(o.followUps.length), warn: o.followUps.length > 0 },
        { label: "Upcoming meetings", value: String(o.meetings.length) },
      ];
    case "finance":
      return [
        { label: "Receivables", value: formatINR(o.receivables.outstandingPaise), note: `${o.receivables.openCount} open invoices` },
        { label: "Overdue", value: formatINR(o.receivables.overduePaise), note: `${o.receivables.overdueCount} invoices`, warn: o.receivables.overdueCount > 0 },
        { label: "Income this month", value: formatINR(o.cash.incomePaise) },
        { label: "Expenses this month", value: formatINR(o.cash.expensePaise) },
      ];
    case "delivery":
      return [
        { label: "Active projects", value: String(o.projects.active) },
        { label: "On hold", value: String(o.projects.onHold) },
        { label: "At risk", value: String(o.projects.atRisk), note: "Milestones past due", warn: o.projects.atRisk > 0 },
        { label: "Overdue tasks", value: String(o.projects.tasksOverdue), note: `${o.projects.inClientReview} waiting on clients`, warn: o.projects.tasksOverdue > 0 },
      ];
    default:
      return [];
  }
}

export function DepartmentFigures({ departmentKey }: { departmentKey: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const wanted = ["sales", "crm", "finance", "delivery"].includes(departmentKey);

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    const timer = setTimeout(() => {
      api<Overview>("/api/overview")
        .then((d) => alive && setData(d))
        .catch(() => undefined);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [wanted]);

  const figures = data ? figuresFor(departmentKey, data) : [];
  if (figures.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">{f.label}</p>
          <p className={`mt-1 text-2xl font-bold ${f.warn ? "text-rose-600" : "text-slate-900"}`}>{f.value}</p>
          {f.note ? <p className="mt-0.5 text-xs text-slate-500">{f.note}</p> : null}
        </div>
      ))}
    </div>
  );
}
