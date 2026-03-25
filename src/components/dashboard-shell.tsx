import Link from "next/link";
import { moduleNav } from "@/lib/navigation";
import { cn } from "@/components/ui/helpers";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function DashboardShell({ title, subtitle, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#fef3c7,_#ecfeff_45%,_#ffffff_70%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="fixed inset-x-0 top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur md:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {moduleNav.map((item) => (
              <Link
                key={`mobile-${item.href}`}
                href={item.href}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
              >
                {item.title}
              </Link>
            ))}
          </div>
        </div>
        <aside className="hidden w-72 shrink-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur md:block">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ReShuffle OS</p>
            <h1 className="mt-2 text-lg font-semibold">Business Command Layer</h1>
          </div>
          <nav className="mt-5 space-y-1">
            {moduleNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                    "hover:bg-slate-100"
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 text-slate-500 group-hover:text-slate-900" />
                  <div>
                    <p className="font-medium leading-5 text-slate-900">{item.title}</p>
                    <p className="text-xs leading-4 text-slate-500">{item.description}</p>
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="mt-12 flex-1 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-6 md:mt-0">
          <header className="mb-6 border-b border-slate-200/80 pb-4">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">{subtitle}</p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
