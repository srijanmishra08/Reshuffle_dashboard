import { getDb } from "@/server/db/client";
import { getPublicScope } from "@/server/services/scope-sharing";
import { AcceptForm } from "./accept-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

type Item = { phase: string; title: string; description?: string | null; days: number; pricePaise: number };
type Step = { label: string; percent: number; amountPaise: number };
type Snapshot = {
  number: string;
  version: number;
  title: string;
  problemStatement: string;
  engagementModel: string | null;
  terms: string;
  totalPaise: number;
  timelineDays: number;
  paymentSchedule: Step[];
  items: Item[];
  seller: { legalName: string };
};

const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);

export default async function PublicScopePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getPublicScope(getDb(), token);

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This link is not valid</h1>
        <p className="mt-2 text-sm text-slate-600">It may have expired or been replaced. Please ask us for a new one.</p>
      </main>
    );
  }

  const snap = result.data.snapshot as unknown as Snapshot;
  const { status } = result.data;
  const phases = [...new Set(snap.items.map((i) => i.phase))];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-900">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {snap.seller.legalName} · {snap.number} · v{snap.version}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{snap.title}</h1>

      {status === "SUPERSEDED" ? (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          A newer version of this scope has been sent. Please use the latest link.
        </p>
      ) : null}

      {snap.problemStatement ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Problem</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{snap.problemStatement}</p>
        </section>
      ) : null}

      {phases.map((phase) => (
        <section key={phase} className="mt-6">
          <h2 className="text-sm font-semibold uppercase text-slate-500">{phase}</h2>
          <table className="mt-1 w-full text-sm">
            <tbody>
              {snap.items
                .filter((i) => i.phase === phase)
                .map((item, index) => (
                  <tr key={index} className="border-t border-slate-200 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{item.title}</div>
                      {item.description ? <div className="text-slate-600">{item.description}</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-600">{item.days} d</td>
                    <td className="py-2 text-right">{inr(item.pricePaise)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}

      <section className="mt-6 rounded border border-slate-200 p-4 text-sm">
        <div className="flex justify-between font-semibold">
          <span>Total ({snap.timelineDays} days)</span>
          <span>{inr(snap.totalPaise)}</span>
        </div>
        <ul className="mt-2 space-y-1 text-slate-700">
          {snap.paymentSchedule.map((s, index) => (
            <li key={index} className="flex justify-between">
              <span>
                {s.label} ({s.percent}%)
              </span>
              <span>{inr(s.amountPaise)}</span>
            </li>
          ))}
        </ul>
      </section>

      {snap.terms ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Terms</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{snap.terms}</p>
        </section>
      ) : null}

      {status === "ACCEPTED" ? (
        <p className="mt-8 rounded bg-emerald-50 p-4 text-sm text-emerald-800">
          Accepted by {result.data.acceptedBy} on {result.data.acceptedAt ? result.data.acceptedAt.toLocaleString("en-IN") : ""}.
        </p>
      ) : status === "SENT" ? (
        <AcceptForm token={token} />
      ) : null}
    </main>
  );
}
