import { DashboardShell } from "@/components/dashboard-shell";
import { LetterEditor } from "@/components/billing/letter-editor";

export default function NewLetterPage() {
  return (
    <DashboardShell title="New letter" subtitle="Write the letter, save a draft, then issue to get a number and PDF.">
      <LetterEditor />
    </DashboardShell>
  );
}
