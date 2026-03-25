import type { DashboardKpi } from "@/lib/types";

type KpiGridProps = {
  items: DashboardKpi[];
};

export function KpiGrid({ items }: KpiGridProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const toneClass =
          item.tone === "good"
            ? "text-emerald-700 bg-emerald-50"
            : item.tone === "warn"
            ? "text-amber-700 bg-amber-50"
            : "text-slate-700 bg-slate-100";

        return (
          <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.title}</p>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{item.value}</p>
            <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
              {item.trend}
            </p>
          </article>
        );
      })}
    </section>
  );
}
