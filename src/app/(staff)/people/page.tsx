import { DashboardShell } from "@/components/dashboard-shell";
import { PeopleList } from "@/components/people/people-list";

export default function Page() {
  return (
    <DashboardShell title="People" subtitle="Team records and salary slips. Admin and manager only.">
      <PeopleList />
    </DashboardShell>
  );
}
