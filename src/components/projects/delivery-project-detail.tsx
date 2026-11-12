"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import {
  deliveryStatuses,
  projectStatusStyles,
  type DeliveryProjectDetail,
  type DeliveryStatusValue,
} from "@/lib/delivery-types";

export function DeliveryProjectDetailView({ id }: { id: string }) {
  const [project, setProject] = useState<DeliveryProjectDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setProject(await api<DeliveryProjectDetail>(`/api/delivery-projects/${id}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load project");
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
    }
  }

  if (!project) return <p className="text-sm text-slate-500">{error || "Loading..."}</p>;

  const remaining = Math.max(project.budgetPaise - project.invoicedPaise, 0);
  const outstanding = Math.max(project.invoicedPaise - project.paidPaise, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{project.name}</h2>
          <p className="text-sm text-slate-500">
            {project.startDate ?? "No start date"} to {project.dueDate ?? "no due date"}
          </p>
        </div>
        <select
          value={project.status}
          onChange={(e) =>
            run("status", () =>
              api(`/api/delivery-projects/${id}`, {
                method: "PATCH",
                ...jsonBody({ status: e.target.value as DeliveryStatusValue }),
              })
            )
          }
          className={`rounded-full px-3 py-1 text-sm font-medium ${projectStatusStyles[project.status]}`}
          aria-label="Project status"
        >
          {deliveryStatuses.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Budget (pre-GST)", formatINR(project.budgetPaise)],
          ["Invoiced (incl. GST)", formatINR(project.invoicedPaise)],
          ["Paid", formatINR(project.paidPaise)],
          ["Outstanding", formatINR(outstanding)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Budget not yet invoiced: {formatINR(remaining)}. Invoiced and paid count issued invoices only.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Milestone</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {project.milestones.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  {m.label} <span className="text-slate-400">({m.percent}%)</span>
                </td>
                <td className="px-3 py-2 text-right">{formatINR(m.amountPaise)}</td>
                <td className="px-3 py-2">{m.dueDate ?? "-"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${projectStatusStyles[m.status]}`}>
                    {m.status}
                  </span>
                </td>
                <td className="space-x-2 px-3 py-2 text-right">
                  {m.status !== "INVOICED" ? (
                    <>
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          run(`ms-${m.id}`, () =>
                            api(`/api/delivery-projects/${id}/milestones/${m.id}`, {
                              method: "PATCH",
                              ...jsonBody({ status: m.status === "DONE" ? "PENDING" : "DONE" }),
                            })
                          )
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
                      >
                        {m.status === "DONE" ? "Mark pending" : "Mark done"}
                      </button>
                      <button
                        disabled={busy !== ""}
                        onClick={() =>
                          run(`inv-${m.id}`, () =>
                            api(`/api/delivery-projects/${id}/milestones/${m.id}/invoice`, { method: "POST" })
                          )
                        }
                        className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        Draft invoice
                      </button>
                    </>
                  ) : m.invoiceId ? (
                    <Link href={`/invoices/${m.invoiceId}`} className="text-xs text-sky-700 hover:underline">
                      Open invoice
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
