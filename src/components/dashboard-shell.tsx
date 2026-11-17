import { MobileNav, SidebarNav } from "@/components/sidebar-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { CommandBar } from "@/components/command-bar";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function DashboardShell({ title, subtitle, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#fef3c7,_#ecfeff_45%,_#ffffff_70%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <MobileNav />
        <aside className="hidden w-72 shrink-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur md:block">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">ReShuffle OS</p>
            <h1 className="mt-2 text-lg font-semibold">Business Command Layer</h1>
          </div>
          <SidebarNav />
          <div className="mt-6 border-t border-slate-200 pt-4">
            <SignOutButton />
          </div>
        </aside>

        <main className="mt-24 flex-1 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-6 md:mt-0">
          <CommandBar />
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
