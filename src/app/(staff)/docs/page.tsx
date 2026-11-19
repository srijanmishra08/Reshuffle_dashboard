import { DashboardShell } from "@/components/dashboard-shell";
import { DocsWorkspace } from "@/components/docs/docs-workspace";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

export default async function DocsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <DashboardShell
      title="Documentation"
      subtitle="SOPs, playbooks, decision logs and notes. Link a doc to a client or a lead and it shows on their page."
    >
      <DocsWorkspace
        openId={first(params.open)}
        companyId={first(params.companyId)}
        dealId={first(params.dealId)}
        startNew={first(params.new) === "1"}
      />
    </DashboardShell>
  );
}
