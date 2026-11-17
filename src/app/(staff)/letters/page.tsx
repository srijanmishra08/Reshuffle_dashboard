import { DashboardShell } from "@/components/dashboard-shell";
import { LetterList } from "@/components/billing/letter-list";

export default function Page() {
  return (
    <DashboardShell title="Letters" subtitle="Numbered letters on letterhead.">
      <LetterList />
    </DashboardShell>
  );
}
