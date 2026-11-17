import { DashboardShell } from "@/components/dashboard-shell";
import { LetterEditor } from "@/components/billing/letter-editor";

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell title="Letter" subtitle="Drafts are editable. Issued letters are frozen.">
      <LetterEditor letterId={id} />
    </DashboardShell>
  );
}
