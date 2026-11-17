import { PortalShell } from "@/components/portal/portal-shell";
import { TaskControls } from "@/components/portal/task-controls";
import { Card, Empty, Pill, Stat, TaskStatusPill, day, money, td, th } from "@/components/portal/ui";
import { getDb } from "@/server/db/client";
import { requirePortalUser } from "@/server/portal-guard";
import { getAgencyHome } from "@/server/services/portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner agency", robots: { index: false, follow: false } };

const finished = (status: string) => status === "COMPLETED" || status === "INVOICED";

export default async function AgencyPage() {
  const user = await requirePortalUser("AGENCY");
  const result = await getAgencyHome(getDb(), user);

  if (!result.ok) {
    return (
      <PortalShell area="Partner agency" userName={user.name} title="Welcome">
        <Card title="Your account is not set up yet">
          <Empty>{result.error}</Empty>
        </Card>
      </PortalShell>
    );
  }

  const { agency, members, tasks, pendingPaise, paidPaise } = result.data;
  const open = tasks.filter((t) => !finished(t.status));
  const today = result.data.today;

  return (
    <PortalShell area="Partner agency" userName={user.name} title={agency.name} subtitle="Your team's work with Reshuffle and what you are owed.">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Team members" value={String(members.length)} />
        <Stat label="Open tasks" value={String(open.length)} />
        <Stat label="Payouts pending" value={money(pendingPaise)} />
        <Stat label="Paid to date" value={money(paidPaise)} tone="good" />
      </div>

      <Card title="Your team">
        {members.length === 0 ? (
          <Empty>No freelancers are linked to your agency yet. Ask your Reshuffle contact to add them.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Skill</th>
                  <th className={th}>Availability</th>
                  <th className={`${th} text-right`}>Open tasks</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-stone-100">
                    <td className={`${td} font-medium`}>{m.name}</td>
                    <td className={td}>{m.skill ?? "—"}</td>
                    <td className={td}>{m.availability ?? "—"}</td>
                    <td className={`${td} text-right`}>{m.openTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Team tasks" note="Move a task, or hand it to another freelancer in your team">
        {tasks.length === 0 ? (
          <Empty>No tasks are assigned to your team yet.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-stone-900">{t.title}</p>
                  <p className="text-xs text-stone-500">
                    {t.projectName} · {t.assigneeName ?? "Unassigned"}
                    {t.dueDate ? <span className={t.dueDate < today && !finished(t.status) ? "font-medium text-rose-600" : ""}> · due {day(t.dueDate)}</span> : null}
                  </p>
                  {t.description ? <p className="mt-1 text-sm text-stone-600">{t.description}</p> : null}
                </div>
                {finished(t.status) ? (
                  <TaskStatusPill status={t.status} />
                ) : (
                  <div className="flex items-center gap-2">
                    {t.status === "REVISION" ? <Pill tone="warn">Changes requested</Pill> : null}
                    <TaskControls taskId={t.id} status={t.status} area="agency" assigneeId={t.assigneeId} members={members.map((m) => ({ id: m.id, name: m.name }))} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PortalShell>
  );
}
