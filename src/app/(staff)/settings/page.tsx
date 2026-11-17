import { DashboardShell } from "@/components/dashboard-shell";
import { requirePageRole } from "@/server/authz";
import { ADMIN_ONLY } from "@/server/roles";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageRole(ADMIN_ONLY, "/settings");

  if (!user) {
    return (
      <DashboardShell title="Settings" subtitle="Organisation, tax and signatory details used on every document.">
        <p className="text-sm text-slate-600">Only admins can view settings.</p>
      </DashboardShell>
    );
  }

  return <SettingsForm />;
}
