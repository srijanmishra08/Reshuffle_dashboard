import Link from "next/link";
import { PortalShell } from "@/components/portal/portal-shell";
import { ReviewActions } from "@/components/portal/review-actions";
import { Card, Empty, Pill, ProgressBar, Stat, day, money, td, th } from "@/components/portal/ui";
import { getDb } from "@/server/db/client";
import { requirePortalUser } from "@/server/portal-guard";
import { getClientHome } from "@/server/services/portal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client portal", robots: { index: false, follow: false } };

const projectTone = (status: string) => (status === "COMPLETED" ? "good" : status === "ON_HOLD" ? "wait" : status === "CANCELLED" ? "warn" : "info");

export default async function ClientPortalPage() {
  const user = await requirePortalUser("CLIENT");
  const result = await getClientHome(getDb(), user);

  if (!result.ok) {
    return (
      <PortalShell area="Client portal" userName={user.name} title="Welcome">
        <Card title="Your account is not set up yet">
          <Empty>{result.error}</Empty>
        </Card>
      </PortalShell>
    );
  }

  const home = result.data;
  const open = home.projects.filter((p) => p.status === "ACTIVE" || p.status === "PLANNED" || p.status === "ON_HOLD");
  const overdue = home.invoices.filter((i) => i.overdue).length;

  return (
    <PortalShell area="Client portal" userName={user.name} title={home.company.name} subtitle="Your projects, invoices and anything waiting for you.">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active projects" value={String(open.length)} />
        <Stat label="Waiting for you" value={String(home.review.length)} note="Work to approve" tone={home.review.length > 0 ? "warn" : undefined} />
        <Stat label="Balance due" value={money(home.owedPaise)} note={overdue ? `${overdue} overdue` : "On invoices issued"} tone={overdue ? "warn" : undefined} />
        <Stat label="Forms to fill" value={String(home.forms.length)} />
      </div>

      {home.review.length > 0 ? (
        <Card title="Waiting for your review" note="Approve it, or ask for changes">
          <ul className="divide-y divide-stone-100">
            {home.review.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-stone-900">{t.title}</p>
                  <p className="text-xs text-stone-500">
                    <Link href={`/portal/projects/${t.projectId}`} className="hover:underline">{t.projectName}</Link>
                    {t.dueDate ? ` · due ${day(t.dueDate)}` : ""}
                  </p>
                  {t.description ? <p className="mt-1 text-sm text-stone-600">{t.description}</p> : null}
                </div>
                <ReviewActions taskId={t.id} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Projects">
        {home.projects.length === 0 ? (
          <Empty>No projects yet. They appear here once work starts.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {home.projects.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/portal/projects/${p.id}`} className="text-sm font-medium text-stone-900 hover:underline">{p.name}</Link>
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    {p.dueDate ? <span>Due {day(p.dueDate)}</span> : null}
                    <Pill tone={projectTone(p.status)}>{p.status.replace("_", " ")}</Pill>
                  </div>
                </div>
                <div className="mt-2">
                  <ProgressBar percent={p.progressPercent} label={`${p.name} progress`} />
                  <p className="mt-0.5 text-xs text-stone-500">
                    {p.tasksTotal > 0 ? `${p.tasksDone} of ${p.tasksTotal} tasks done` : p.milestonesTotal > 0 ? `${p.milestonesDone} of ${p.milestonesTotal} milestones` : "Planning"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Invoices">
        {home.invoices.length === 0 ? (
          <Empty>No invoices yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Invoice</th>
                  <th className={th}>Issued</th>
                  <th className={th}>Due</th>
                  <th className={`${th} text-right`}>Total</th>
                  <th className={`${th} text-right`}>Paid</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {home.invoices.map((i) => (
                  <tr key={i.id} className="border-t border-stone-100">
                    <td className={`${td} font-medium`}>{i.number}</td>
                    <td className={td}>{day(i.issueDate)}</td>
                    <td className={td}>{day(i.dueDate)}</td>
                    <td className={`${td} text-right`}>{money(i.totalPaise)}</td>
                    <td className={`${td} text-right`}>{money(i.paidPaise)}</td>
                    <td className={td}>
                      <Pill tone={i.status === "PAID" ? "good" : i.overdue ? "warn" : "wait"}>{i.status === "PAID" ? "Paid" : i.overdue ? "Overdue" : i.status === "PARTIALLY_PAID" ? "Part paid" : "Due"}</Pill>
                    </td>
                    <td className={`${td} text-right`}>
                      <a href={`/api/portal/client/invoices/${i.id}/pdf`} className="text-sm text-sky-700 hover:underline">PDF</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {home.scopes.length > 0 ? (
        <Card title="Proposals">
          <ul className="divide-y divide-stone-100">
            {home.scopes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-sm font-medium text-stone-900">{s.title}</p>
                  <p className="text-xs text-stone-500">{s.number} · {money(s.totalPaise)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Pill tone={s.status === "ACCEPTED" ? "good" : "wait"}>{s.status === "ACCEPTED" ? `Accepted ${day(s.acceptedAt)}` : "Sent"}</Pill>
                  <a href={`/api/portal/client/scopes/${s.id}/pdf`} className="text-sm text-sky-700 hover:underline">PDF</a>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {home.forms.length > 0 ? (
        <Card title="Forms for you to fill">
          <ul className="divide-y divide-stone-100">
            {home.forms.map((f) => (
              <li key={f.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-stone-900">{f.title}</span>
                <a href={f.path} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">Open form</a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </PortalShell>
  );
}
