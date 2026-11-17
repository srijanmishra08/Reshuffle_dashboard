import { PreviewBanner } from "@/components/portal/preview-banner";
import { SignOutButton } from "@/components/sign-out-button";

type PortalShellProps = {
  area: string;
  userName: string;
  title: string;
  subtitle?: string;
  /** True when an admin is previewing this portal with demo data. */
  previewing?: boolean;
  children: React.ReactNode;
};

/** Frame for the outside portals: a plain top bar and one column, nothing from the team dashboard. */
export function PortalShell({ area, userName, title, subtitle, previewing, children }: PortalShellProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {previewing ? <PreviewBanner area={area} /> : null}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight">Reshuffle</span>
            <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-xs font-medium text-white">{area}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-600">{userName}</span>
            <div className="w-24 text-center"><SignOutButton /></div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-stone-600">{subtitle}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
