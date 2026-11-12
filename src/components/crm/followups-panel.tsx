"use client";

import Link from "next/link";
import { formatDate, isOverdue, type FollowUp } from "@/lib/crm-types";

export function FollowUpsPanel({ items }: { items: FollowUp[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Due follow-ups</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nothing due in the next 24 hours.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <Link href={`/crm/${item.companyId}`} className="font-medium text-slate-900 hover:underline">
                  {item.companyName}
                </Link>
                <p className="text-slate-600">{item.nextAction}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isOverdue(item.nextActionAt) ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {formatDate(item.nextActionAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
