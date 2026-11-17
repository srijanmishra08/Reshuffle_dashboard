import { DashboardShell } from "@/components/dashboard-shell";
import { QuestionnaireList } from "@/components/questionnaires/questionnaire-list";

export default function QuestionnairesPage() {
  return (
    <DashboardShell title="Questionnaires" subtitle="Forms a client fills in from a link. Answers land here.">
      <QuestionnaireList />
    </DashboardShell>
  );
}
