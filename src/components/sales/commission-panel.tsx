"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR, toPaise } from "@/server/lib/money";

type CommissionView = {
  node: { id: string; name: string; commissionPercent: number };
  deals: { id: string; title: string; companyName: string; valuePaise: number; duePaise: number; paidPaise: number; owedPaise: number }[];
  payments: { id: string; dealId: string; dealTitle: string; amountPaise: number; paidOn: string; note: string | null }[];
  totals: { duePaise: number; paidPaise: number; owedPaise: number };
};

const input = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";

/** Rupees owed as a plain "1234.50" string for the amount box. */
function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Referral commission for one sales node: what is due on each accepted deal, what has been paid, and a form to
 * record a payment (booked in the ledger as an expense). Admins can remove a payment recorded by mistake.
 */
export function CommissionPanel({ nodeId, isAdmin, onChanged, onClose }: { nodeId: string; isAdmin: boolean; onChanged: () => void; onClose: () => void }) {
  const [view, setView] = useState<CommissionView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ dealId: "", amount: "", paidOn: "", note: "" });

  const load = useCallback(async () => {
    try {
      const data = await api<CommissionView>(`/api/sales-nodes/${nodeId}/commissions`);
      setView(data);
      setError("");
      const firstOwed = data.deals.find((d) => d.owedPaise > 0);
      setForm((f) => (f.dealId && data.deals.some((d) => d.id === f.dealId && d.owedPaise > 0) ? f : { ...f, dealId: firstOwed?.id ?? "", amount: firstOwed ? rupees(firstOwed.owedPaise) : "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load commission");
    }
  }, [nodeId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function record(event: FormEvent) {
    event.preventDefault();
    setError("");
    let amountPaise: number;
    try {
      amountPaise = toPaise(form.amount);
    } catch {
      setError("Enter the amount in rupees, for example 2500 or 2500.50");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/sales-nodes/${nodeId}/commissions`, {
        method: "POST",
        ...jsonBody({ dealId: form.dealId, amountPaise, ...(form.paidOn ? { paidOn: form.paidOn } : {}), note: form.note }),
      });
      setForm({ dealId: "", amount: "", paidOn: "", note: "" });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the payment");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this commission payment and its ledger entry?")) return;
    setError("");
    try {
      await api(`/api/commission-payments/${id}`, { method: "DELETE" });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the payment");
    }
  }

  const payable = view?.deals.filter((d) => d.owedPaise > 0) ?? [];

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-label="Referral commission">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Commission: {view?.node.name ?? "…"}</h2>
          {view ? (
            <p className="text-xs text-slate-500">
              {view.node.commissionPercent}% of accepted deals · due {formatINR(view.totals.duePaise)} · paid {formatINR(view.totals.paidPaise)} · owed{" "}
              <span className="font-medium text-slate-900">{formatINR(view.totals.owedPaise)}</span>
            </p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="text-xs font-medium text-slate-600 hover:underline">Close</button>
      </div>
      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}

      {view && view.node.commissionPercent === 0 ? (
        <p className="text-sm text-slate-600">No commission rate is set for this sales node. Edit it above to add one.</p>
      ) : null}

      {view ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1.5">Accepted deal</th>
                <th className="px-2 py-1.5 text-right">Deal value</th>
                <th className="px-2 py-1.5 text-right">Due</th>
                <th className="px-2 py-1.5 text-right">Paid</th>
                <th className="px-2 py-1.5 text-right">Owed</th>
              </tr>
            </thead>
            <tbody>
              {view.deals.length === 0 ? (
                <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-500">No accepted deals from this sales node yet.</td></tr>
              ) : null}
              {view.deals.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1.5">
                    <Link href={`/sales/${d.id}`} className="font-medium text-slate-900 hover:underline">{d.title}</Link>
                    <span className="block text-xs text-slate-500">{d.companyName}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{formatINR(d.valuePaise)}</td>
                  <td className="px-2 py-1.5 text-right">{formatINR(d.duePaise)}</td>
                  <td className="px-2 py-1.5 text-right">{formatINR(d.paidPaise)}</td>
                  <td className={`px-2 py-1.5 text-right ${d.owedPaise > 0 ? "font-medium text-amber-700" : "text-slate-400"}`}>{formatINR(d.owedPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {payable.length > 0 ? (
        <form onSubmit={record} className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
          <label className={`${label} sm:col-span-2`}>
            Deal
            <select
              required
              value={form.dealId}
              onChange={(e) => {
                const deal = payable.find((d) => d.id === e.target.value);
                setForm({ ...form, dealId: e.target.value, amount: deal ? rupees(deal.owedPaise) : form.amount });
              }}
              className={input}
            >
              <option value="">Pick a deal</option>
              {payable.map((d) => (
                <option key={d.id} value={d.id}>{d.title} · owed {formatINR(d.owedPaise)}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Amount paid (₹)
            <input required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
          </label>
          <label className={label}>
            Paid on (blank = today)
            <input type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} className={input} />
          </label>
          <label className={`${label} sm:col-span-3`}>
            Note (optional, e.g. UPI reference)
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} />
          </label>
          <div className="flex items-end">
            <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record payment</button>
          </div>
        </form>
      ) : null}

      {view && view.payments.length > 0 ? (
        <div className="border-t border-slate-100 pt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Payments</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {view.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  {p.paidOn} · {p.dealTitle}
                  {p.note ? <span className="text-slate-500"> · {p.note}</span> : null}
                </span>
                <span className="whitespace-nowrap">
                  {formatINR(p.amountPaise)}
                  {isAdmin ? (
                    <button type="button" onClick={() => void remove(p.id)} className="ml-3 text-xs font-medium text-rose-600 hover:underline">Remove</button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
