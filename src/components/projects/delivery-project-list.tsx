"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import { deliveryStatuses, projectStatusStyles, type DeliveryProjectRow } from "@/lib/delivery-types";

export function DeliveryProjectList() {
  const [rows, setRows] = useState<DeliveryProjectRow[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    try {
      setRows(await api<DeliveryProjectRow[]>(`/api/delivery-projects?${params}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load projects");
    }
  }, [status]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Projects are created from won deals with an accepted scope (Sales board).
        </p>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {deliveryStatuses.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Budget</th>
              <th className="px-3 py-2">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <Link href={`/projects/${p.id}`} className="font-medium text-sky-700 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{p.companyName}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${projectStatusStyles[p.status]}`}>
                    {p.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{formatINR(p.budgetPaise)}</td>
                <td className="px-3 py-2">{p.dueDate ?? "-"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No projects yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
