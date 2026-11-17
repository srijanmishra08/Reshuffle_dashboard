import { PortalShell } from "@/components/portal/portal-shell";
import { TaskControls } from "@/components/portal/task-controls";
import { Card, Empty, Pill, Stat, TaskStatusPill, day, money, td, th } from "@/components/portal/ui";
import { getDb } from "@/server/db/client";
import { requirePortalUser } from "@/server/portal-guard";
import { getFreelancerHome } from "@/server/services/portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work", robots: { index: false, follow: false } };

const finished = (status: string) => status === "COMPLETED" || status === "INVOICED";

export default async function FreelancerPage() {
  const user = await requirePortalUser("FREELANCER");
  const result = await getFreelancerHome(getDb(), user);

  if (!result.ok) {
    return (
      <PortalShell area="Freelancer" userName={user.name} previewing={user.previewing} title="Welcome">
        <Card title="Your account is not set up yet">
          <Empty>{result.error}</Empty>
        </Card>
      </PortalShell>
    );
  }

  const me = result.data;
  const open = me.tasks.filter((t) => !finished(t.status));
  const today = me.today;

  return (
    <PortalShell area="Freelancer" userName={user.name} previewing={user.previewing} title={`Hello, ${me.freelancer.name}`} subtitle="Your tasks, projects and payouts.">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Open tasks" value={String(open.length)} />
        <Stat label="Workload" value={`${me.utilizationPct}%`} note="Active assignments" tone={me.utilizationPct > 100 ? "warn" : undefined} />
        <Stat label="Payouts pending" value={money(me.pendingPaise)} />
        <Stat label="Paid to date" value={money(me.paidPaise)} tone="good" />
      </div>

      <Card title="My tasks" note="Move a task as you work. Finished work is closed by the team.">
        {me.tasks.length === 0 ? (
          <Empty>Nothing is assigned to you yet.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {me.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-stone-900">{t.title}</p>
                  <p className="text-xs text-stone-500">
                    {t.projectName}
                    {t.dueDate ? (
                      <span className={t.dueDate < today && !finished(t.status) ? "font-medium text-rose-600"  : ""}> · due {day(t.dueDate)}</span>
                    ) : null}
                  </p>
                  {t.description ? <p className="mt-1 text-sm text-stone-600">{t.description}</p> : null}
                </div>
                {t.status === "REVISION" || finished(t.status) ? (
                  <div className="flex items-center gap-2">
                    <TaskStatusPill status={t.status} />
                    {t.status === "REVISION" ? <TaskControls taskId={t.id} status={t.status} area="freelancer" /> : null}
                  </div>
                ) : (
                  <TaskControls taskId={t.id} status={t.status} area="freelancer" />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Projects I am on">
        {me.assignments.length === 0 ? (
          <Empty>No project assignments yet.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {me.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="font-medium text-stone-900">{a.projectName}</span>
                <span className="text-stone-600">
                  {a.role || "Team member"} · {a.allocationPct}% · {day(a.startDate)} to {a.endDate ? day(a.endDate) : "ongoing"}{" "}
                  <Pill tone={a.status === "ACTIVE" ? "info" : "muted"}>{a.status === "ACTIVE" ? "Active" : "Ended"}</Pill>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="My payouts">
        {me.payouts.length === 0 ? (
          <Empty>No payouts yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>For</th>
                  <th className={th}>Project</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={th}>Due</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {me.payouts.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100">
                    <td className={td}>{p.description || "—"}</td>
                    <td className={td}>{p.projectName ?? "—"}</td>
                    <td className={`${td} text-right`}>{money(p.amountPaise)}</td>
                    <td className={td}>{day(p.dueDate)}</td>
                    <td className={td}>
                      {p.status === "PAID" ? <Pill tone="good">Paid {day(p.paidOn)}</Pill> : p.status === "CANCELLED" ? <Pill>Cancelled</Pill> : <Pill tone="wait">Pending</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-stone-500">Something wrong? Tell your Reshuffle contact; they can fix assignments and payouts.</p>
    </PortalShell>
  );
}
