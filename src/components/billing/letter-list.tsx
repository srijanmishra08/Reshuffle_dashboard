"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LetterListRow } from "@/lib/billing-types";
import { StatusBadge } from "@/components/billing/status-badge";

export function LetterList() {
  const [rows, setRows] = useState<LetterListRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api<LetterListRow[]>("/api/letters")
        .then(setRows)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load letters"));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link href="/letters/new" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">New letter</Link>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">To</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium"><Link className="underline" href={`/letters/${r.id}`}>{r.number ?? "Draft"}</Link></td>
                <td className="px-3 py-2">{r.recipientName}</td>
                <td className="px-3 py-2">{r.subject}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2">{r.issueDate ?? ""}</td>
                <td className="px-3 py-2">
                  {r.number ? <a className="text-sky-700 underline" href={`/api/letters/${r.id}/pdf`}>Download</a> : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No letters yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
