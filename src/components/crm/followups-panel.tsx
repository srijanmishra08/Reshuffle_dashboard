"use client";

import Link from "next/link";
import { useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatDate, isOverdue, type FollowUp } from "@/lib/crm-types";

const dayOnly = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

/**
 * Everything due next, from both places it is recorded: next actions logged on a client, and the follow-up date on
 * each open lead. A lead can be marked done (clears its date) or moved to another day right here.
 */
export function FollowUpsPanel({ items, onChanged }: { items: FollowUp[]; onChanged?: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function setLeadDate(item: FollowUp, date: string | null) {
    if (!item.dealId) return;
    setBusy(item.id);
    setError("");
    try {
      await api(`/api/deals/${item.dealId}`, { method: "PATCH", ...jsonBody({ nextFollowUp: date }) });
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the follow-up");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Due follow-ups</h3>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nothing due in the next 24 hours.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={item.href} className="font-medium text-slate-900 hover:underline">
                    {item.companyName}
                  </Link>
                  <p className="text-slate-600">{item.nextAction}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    isOverdue(item.nextActionAt) ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {item.allDay ? dayOnly(item.nextActionAt) : formatDate(item.nextActionAt)}
                </span>
              </div>
              {item.kind === "LEAD" ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <label className="flex items-center gap-1">
                    Move to
                    <input
                      type="date"
                      disabled={busy === item.id}
                      onChange={(e) => e.target.value && void setLeadDate(item, e.target.value)}
                      className="rounded border border-slate-300 px-1 py-0.5 text-xs text-slate-900"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void setLeadDate(item, null)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Done
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
