import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/portal/portal-shell";
import { ClientTaskBoard } from "@/components/portal/client-task-board";
import { Card, Empty, Pill, ProgressBar, day, money, td, th } from "@/components/portal/ui";
import { getDb } from "@/server/db/client";
import { requirePortalUser } from "@/server/portal-guard";
import { getClientProject } from "@/server/services/portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project", robots: { index: false, follow: false } };

export default async function ClientProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalUser("CLIENT");
  const { id } = await params;
  const result = await getClientProject(getDb(), user, id);
  if (!result.ok) notFound();
  const p = result.data;

  return (
    <PortalShell
      area="Client portal"
      userName={user.name} previewing={user.previewing} readOnlyPreview={user.previewReadOnly}
      title={p.name}
      subtitle={`${p.startDate ? `Started ${day(p.startDate)}` : "Not started"}${p.dueDate ? ` · due ${day(p.dueDate)}` : ""}`}
    >
      <Link href="/portal" className="text-sm text-stone-600 hover:underline">← Back to your overview</Link>

      <Card title="Progress" note={p.status.replace("_", " ")}>
        <ProgressBar percent={p.progressPercent} label="Project progress" />
      </Card>

      <Card title="Task board" note="The team moves work along. Answer on cards in Waiting for you.">
        {p.tasks.length === 0 ? <Empty>No tasks yet.</Empty> : <ClientTaskBoard tasks={p.tasks} today={p.today} readOnly={user.previewReadOnly} />}
      </Card>

      {p.milestones.length > 0 ? (
        <Card title="Payment milestones" note={`${money(p.paidPaise)} paid of ${money(p.invoicedPaise)} invoiced`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Milestone</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={th}>Due</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {p.milestones.map((m) => (
                  <tr key={m.id} className="border-t border-stone-100">
                    <td className={td}>{m.label} <span className="text-stone-400">({m.percent}%)</span></td>
                    <td className={`${td} text-right`}>{money(m.amountPaise)}</td>
                    <td className={td}>{day(m.dueDate)}</td>
                    <td className={td}><Pill tone={m.status === "PENDING" ? "muted" : m.status === "DONE" ? "good" : "info"}>{m.status === "PENDING" ? "Upcoming" : m.status === "DONE" ? "Work done" : "Invoiced"}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-stone-500">Amounts are before GST.</p>
        </Card>
      ) : null}
    </PortalShell>
  );
}
