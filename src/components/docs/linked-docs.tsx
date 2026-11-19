"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type LinkedDoc = {
  id: string;
  title: string;
  type: string;
  status: string;
  updatedAt: string;
  dealTitle: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  PUBLISHED: "Published",
  DEPRECATED: "Deprecated",
};

/**
 * Docs linked to a client or a lead, with a shortcut to write a new one that is already linked.
 * A client's list also includes the docs written against its leads.
 */
export function LinkedDocs({ companyId, dealId }: { companyId?: string; dealId?: string }) {
  const [docs, setDocs] = useState<LinkedDoc[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (dealId) params.set("dealId", dealId);
    else if (companyId) params.set("companyId", companyId);
    api<LinkedDoc[]>(`/api/docs?${params}`)
      .then(setDocs)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load docs"));
  }, [companyId, dealId]);

  const newParams = new URLSearchParams({ new: "1" });
  if (companyId) newParams.set("companyId", companyId);
  if (dealId) newParams.set("dealId", dealId);

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {docs === null && !error ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {docs?.length === 0 ? <p className="text-sm text-slate-500">No docs linked yet.</p> : null}
      <ul className="divide-y divide-slate-100">
        {docs?.map((d) => (
          <li key={d.id} className="py-2">
            <Link href={`/docs?open=${d.id}`} className="text-sm font-medium text-slate-900 hover:underline">
              {d.title}
            </Link>
            <p className="text-xs text-slate-500">
              {[d.type, STATUS_LABEL[d.status] ?? d.status, !dealId ? d.dealTitle : null].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <Link href={`/docs?${newParams}`} className="inline-block text-sm font-medium text-slate-700 hover:underline">
        + New doc
      </Link>
    </div>
  );
}
