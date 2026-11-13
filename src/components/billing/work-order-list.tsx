"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import type { WorkOrderListRow } from "@/lib/billing-types";
import { StatusBadge } from "@/components/billing/status-badge";

export function WorkOrderList() {
  const [rows, setRows] = useState<WorkOrderListRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api<WorkOrderListRow[]>("/api/work-orders")
        .then(setRows)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load work orders"));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Issued</th>
              <th className="px-3 py-2">Completed</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{r.number ?? "Draft"}</td>
                <td className="px-3 py-2">{r.companyName}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2">{r.issueDate ?? ""}</td>
                <td className="px-3 py-2">{r.completedDate ?? ""}</td>
                <td className="px-3 py-2 text-right">{formatINR(r.totalPaise)}</td>
                <td className="px-3 py-2">
                  {r.number ? <a className="text-sky-700 underline" href={`/api/work-orders/${r.id}/pdf`}>Download</a> : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No work orders yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
