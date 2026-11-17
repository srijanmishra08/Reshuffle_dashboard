import type { ReactNode } from "react";
import { taskStatusLabels, type TaskStatusName } from "@/lib/schemas/project-tasks";

export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);

/** `2026-11-05` or a Date becomes `5 Nov 2026`. Empty becomes a dash. */
export function day(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00+05:30`) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        {note ? <p className="text-xs text-stone-500">{note}</p> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" | "good" }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-rose-600" : tone === "good" ? "text-emerald-700" : "text-stone-900"}`}>{value}</p>
      {note ? <p className="mt-0.5 text-xs text-stone-500">{note}</p> : null}
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${value >= 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold text-stone-900">{value}%</span>
    </div>
  );
}

const pillTone: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800",
  warn: "bg-rose-100 text-rose-800",
  info: "bg-sky-100 text-sky-800",
  wait: "bg-amber-100 text-amber-800",
  muted: "bg-stone-100 text-stone-700",
};

export function Pill({ tone = "muted", children }: { tone?: keyof typeof pillTone; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pillTone[tone]}`}>{children}</span>;
}

const statusTone: Record<TaskStatusName, keyof typeof pillTone> = {
  BACKLOG: "muted",
  TODO: "muted",
  IN_PROGRESS: "info",
  CLIENT_REVIEW: "wait",
  REVISION: "warn",
  COMPLETED: "good",
  INVOICED: "good",
};

export function TaskStatusPill({ status }: { status: string }) {
  const known = status as TaskStatusName;
  return <Pill tone={statusTone[known] ?? "muted"}>{taskStatusLabels[known] ?? status}</Pill>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-stone-500">{children}</p>;
}

export const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-stone-500";
export const td = "px-3 py-2 text-sm text-stone-800";
