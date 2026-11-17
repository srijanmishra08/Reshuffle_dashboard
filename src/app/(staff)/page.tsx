import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { departments } from "@/lib/navigation";

export default function Home() {
  return (
    <DashboardShell title="ReShuffle Dashboard" subtitle="Pipeline, receivables, delivery and this week's follow-ups.">
      <div className="space-y-6">
        <nav aria-label="Departments" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {departments.map((d) => {
            const Icon = d.icon;
            return (
              <Link
                key={d.key}
                href={`/d/${d.key}`}
                className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400"
              >
                <Icon className="h-4 w-4 text-slate-500 group-hover:text-slate-900" />
                {d.title}
              </Link>
            );
          })}
        </nav>
        <OverviewDashboard />
      </div>
    </DashboardShell>
  );
}
