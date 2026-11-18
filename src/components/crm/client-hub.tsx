"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { formatINR } from "@/server/lib/money";

type Hub = {
  company: { id: string; name: string };
  deals: { id: string; title: string; stage: string; valuePaise: number; expectedClose: string | null; modules: { id: string; name: string; pricePaise: number }[] }[];
  scopes: { id: string; dealId: string; number: string | null; title: string; status: string; version: number; totalPaise: number }[];
  invoices: { id: string; number: string | null; status: string; issueDate: string | null; dueDate: string | null; totalPaise: number; paidPaise: number }[];
  workOrders: { id: string; number: string | null; status: string; issueDate: string | null }[];
  letters: { id: string; number: string | null; subject: string; status: string; issueDate: string | null }[];
  forms: { id: string; title: string; status: string; responses: number }[];
  access: { email: string; hasSignedIn: boolean }[];
  moneyHidden: boolean;
  accessHidden: boolean;
  billedPaise: number;
  paidPaise: number;
};

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const pill = "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700";
const link = "font-medium text-slate-900 hover:underline";
const empty = (text: string) => <p className="text-sm text-slate-500">{text}</p>;
const label = (s: string) => s.replace(/_/g, " ").toLowerCase();

/**
 * One client's deals, proposals, invoices, work orders, forms and portal sign-ins, each linking to its own page.
 * Projects have their own card above, so everything about a client can be reached from here.
 */
export function ClientHub({ companyId }: { companyId: string }) {
  const [hub, setHub] = useState<Hub | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api<Hub>(`/api/companies/${companyId}/hub`)
        .then(setHub)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load the client overview"));
    }, 0);
    return () => clearTimeout(timer);
  }, [companyId]);

  if (!hub) return <p className="text-sm text-slate-500">{error || "Loading..."}</p>;

  return (
    <div className="space-y-4">
      <Card title="Deals" action={<Link href="/sales" className="text-xs text-slate-500 underline">Sales board</Link>}>
        {hub.deals.length === 0 ? (
          empty("No deals yet. Start one from the Sales board.")
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {hub.deals.map((d) => (
              <li key={d.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/sales/${d.id}`} className={link}>{d.title}</Link>
                  <span className="flex items-center gap-2 text-slate-600">
                    {d.valuePaise ? formatINR(d.valuePaise) : null}
                    <span className={pill}>{label(d.stage)}</span>
                  </span>
                </div>
                {d.modules.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {d.modules.map((m) => (
                      <span key={m.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{m.name}</span>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Proposals">
        {hub.scopes.length === 0 ? (
          empty("No proposals yet.")
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {hub.scopes.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/sales/${s.dealId}/scopes/${s.id}`} className={link}>
                  {s.title} <span className="font-normal text-slate-500">v{s.version}</span>
                </Link>
                <span className="flex items-center gap-2 text-slate-600">
                  {formatINR(s.totalPaise)}
                  <span className={pill}>{s.number ? `${s.number} · ${label(s.status)}` : label(s.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {hub.moneyHidden ? null : (
        <>
          <Card title="Invoices" action={<span className="text-xs text-slate-500">Billed {formatINR(hub.billedPaise)} · paid {formatINR(hub.paidPaise)}</span>}>
            {hub.invoices.length === 0 ? (
              empty("No invoices yet.")
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {hub.invoices.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/invoices/${i.id}`} className={link}>{i.number ?? "Draft invoice"}</Link>
                    <span className="flex items-center gap-2 text-slate-600">
                      {formatINR(i.totalPaise)}
                      <span className={pill}>{label(i.status)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Work orders">
            {hub.workOrders.length === 0 ? (
              empty("No work orders yet.")
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {hub.workOrders.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/work-orders/${w.id}`} className={link}>{w.number ?? "Draft work order"}</Link>
                    <span className={pill}>{label(w.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Letters and agreements" action={<Link href="/letters/new" className="text-xs text-slate-500 underline">New letter</Link>}>
            {hub.letters.length === 0 ? (
              empty("No letters, offer letters or service agreements for this client yet.")
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {hub.letters.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/letters/${l.id}`} className={link}>{l.subject || l.number || "Draft letter"}</Link>
                    <span className={pill}>{l.number ? `${l.number} · ${label(l.status)}` : label(l.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <Card title="Forms" action={<Link href="/questionnaires" className="text-xs text-slate-500 underline">All forms</Link>}>
        {hub.forms.length === 0 ? (
          empty("No onboarding forms linked to this client. Link one on its questionnaire page.")
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {hub.forms.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/questionnaires/${f.id}`} className={link}>{f.title}</Link>
                <span className="text-slate-600">{f.responses} response{f.responses === 1 ? "" : "s"} · {f.status === "OPEN" ? "open" : "closed"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {hub.accessHidden ? null : (
      <Card title="Client portal sign-ins" action={<Link href="/access" className="text-xs text-slate-500 underline">Manage access</Link>}>
        {hub.access.length === 0 ? (
          empty("No one from this client can sign in yet. Admins add them on the Access page.")
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {hub.access.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-2 py-2">
                <span>{a.email}</span>
                <span className="text-slate-600">{a.hasSignedIn ? "Has signed in" : "Not yet"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      )}
    </div>
  );
}
