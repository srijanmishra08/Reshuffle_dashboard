"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, jsonBody } from "@/lib/api";
import { rupeesToPaise } from "@/lib/billing-types";
import { formatINR } from "@/server/lib/money";

type Payment = {
  id: string;
  dealId: string | null;
  dealTitle: string | null;
  amountPaise: number;
  paidOn: string;
  reference: string | null;
  notes: string | null;
};
type WonDeal = { id: string; title: string; salesNodeId: string | null; valuePaise: number };

const input = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";

function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/**
 * Referral commission paid to one sales node: the payments so far and a form to record a new one.
 * Each payment also books an expense in the Finance ledger. Admins can delete a payment recorded by mistake.
 */
export function CommissionPanel({
  nodeId,
  nodeName,
  commissionPercent,
  owedPaise,
  isAdmin,
  onChanged,
  onClose,
}: {
  nodeId: string;
  nodeName: string;
  commissionPercent: number;
  owedPaise: number;
  isAdmin: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [deals, setDeals] = useState<WonDeal[]>([]);
  const [form, setForm] = useState({ amount: "", paidOn: todayIst(), dealId: "", reference: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPayments(await api<Payment[]>(`/api/sales-nodes/${nodeId}/commission-payments`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments");
    }
  }, [nodeId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      api<WonDeal[]>("/api/deals?stage=WON")
        .then((rows) => setDeals(rows.filter((d) => d.salesNodeId === nodeId)))
        .catch(() => setDeals([]));
    }, 0);
    return () => clearTimeout(timer);
  }, [load, nodeId]);

  async function record(event: FormEvent) {
    event.preventDefault();
    setError("");
    const amountPaise = rupeesToPaise(form.amount);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      setError("Enter the amount in rupees, for example 2500 or 2500.50");
      return;
    }
    if (amountPaise > owedPaise && !window.confirm(`This is more than the ${formatINR(Math.max(owedPaise, 0))} owed. Record it as an advance?`)) return;
    setBusy(true);
    try {
      await api(`/api/sales-nodes/${nodeId}/commission-payments`, {
        method: "POST",
        ...jsonBody({ amountPaise, paidOn: form.paidOn, dealId: form.dealId || null, reference: form.reference, notes: form.notes }),
      });
      setForm({ amount: "", paidOn: todayIst(), dealId: "", reference: "", notes: "" });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the payment");
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Payment) {
    if (!window.confirm(`Delete the ${formatINR(p.amountPaise)} payment of ${p.paidOn}? Its ledger entry is removed too.`)) return;
    setError("");
    try {
      await api(`/api/commission-payments/${p.id}`, { method: "DELETE" });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the payment");
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          Commission for {nodeName}
          <span className="ml-2 font-normal text-slate-500">
            {commissionPercent ? `${commissionPercent}% of accepted deals` : "No rate set"} · {owedPaise >= 0 ? `${formatINR(owedPaise)} owed` : `${formatINR(-owedPaise)} paid in advance`}
          </span>
        </h2>
        <button type="button" onClick={onClose} className="text-xs font-medium text-slate-600 hover:underline">Close</button>
      </div>

      <form onSubmit={record} className="grid gap-3 sm:grid-cols-5">
        <label className={label}>
          Amount (₹)
          <input required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
        </label>
        <label className={label}>
          Paid on
          <input required type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} className={input} />
        </label>
        <label className={label}>
          For deal (optional)
          <select value={form.dealId} onChange={(e) => setForm({ ...form, dealId: e.target.value })} className={input}>
            <option value="">Lump sum</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>{d.title} · {formatINR(d.valuePaise)}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Reference
          <input value={form.reference} placeholder="UPI or bank ref" onChange={(e) => setForm({ ...form, reference: e.target.value })} className={input} />
        </label>
        <label className={label}>
          Notes
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} />
        </label>
        <div className="sm:col-span-5">
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving…" : "Record payment"}</button>
          <span className="ml-3 text-xs text-slate-500">Also adds an expense to the Finance ledger.</span>
        </div>
      </form>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1.5">Paid on</th>
              <th className="px-2 py-1.5">Deal</th>
              <th className="px-2 py-1.5">Reference</th>
              <th className="px-2 py-1.5 text-right">Amount</th>
              {isAdmin ? <th className="px-2 py-1.5" /> : null}
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={isAdmin ? 5 : 4} className="px-2 py-4 text-center text-slate-500">No commission paid yet.</td></tr>
            ) : null}
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5">{p.paidOn}</td>
                <td className="px-2 py-1.5">{p.dealTitle ?? "Lump sum"}</td>
                <td className="px-2 py-1.5 text-slate-600">{[p.reference, p.notes].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-2 py-1.5 text-right">{formatINR(p.amountPaise)}</td>
                {isAdmin ? (
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" onClick={() => void remove(p)} className="text-xs font-medium text-rose-700 hover:underline">Delete</button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
