import { DashboardShell } from "@/components/dashboard-shell";
import { QuestionnaireDetail } from "@/components/questionnaires/questionnaire-detail";

export default async function QuestionnairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell title="Questionnaire" subtitle="Edit the questions, share the link, read the answers.">
      <QuestionnaireDetail id={id} />
    </DashboardShell>
  );
}
