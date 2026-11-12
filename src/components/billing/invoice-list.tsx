"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import type { InvoiceListRow, InvoiceStatus, Receivables } from "@/lib/billing-types";
import { StatusBadge } from "@/components/billing/status-badge";

const filters: (InvoiceStatus | "")[] = ["", "DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"];

export function InvoiceList() {
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [summary, setSummary] = useState<Receivables | null>(null);
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (overdueOnly) params.set("overdue", "true");
    try {
      const data = await api<{ invoices: InvoiceListRow[]; summary: Receivables }>(`/api/invoices?${params}`);
      setRows(data.invoices);
      setSummary(data.summary);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load invoices");
    }
  }, [status, overdueOnly]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatINR(summary?.outstandingPaise ?? 0)} note={`${summary?.openCount ?? 0} open`} />
        <Stat label="Overdue" value={formatINR(summary?.overduePaise ?? 0)} note={`${summary?.overdueCount ?? 0} invoices`} tone="rose" />
        <Link href="/invoices/new" className="flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700">
          New invoice
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f || "all"}
            onClick={() => setStatus(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === f ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
          >
            {f ? f.replace("_", " ") : "All"}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
        </label>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/invoices/${r.id}`}>{r.number ?? "Draft"}</Link>
                </td>
                <td className="px-3 py-2">{r.companyName}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} overdue={Boolean(r.overdueAt)} /></td>
                <td className="px-3 py-2">{r.dueDate ?? ""}</td>
                <td className="px-3 py-2 text-right">{formatINR(r.totalPaise)}</td>
                <td className="px-3 py-2 text-right">{formatINR(r.totalPaise - r.paidPaise)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No invoices yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "rose" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "rose" ? "text-rose-700" : "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}
