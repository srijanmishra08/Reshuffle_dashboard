"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import type { LetterDetail } from "@/lib/billing-types";
import type { Company } from "@/lib/crm-types";
import { StatusBadge } from "@/components/billing/status-badge";

const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const label = "text-xs font-medium uppercase tracking-wide text-slate-500";

export function LetterEditor({ letterId }: { letterId?: string }) {
  const router = useRouter();
  const [letter, setLetter] = useState<LetterDetail | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // One key per page load: a double click or retry reuses it, so no second number is burned.
  const issueKey = useRef(crypto.randomUUID());

  function hydrate(data: LetterDetail) {
    setLetter(data);
    setCompanyId(data.companyId ?? "");
    setRecipientName(data.recipientName);
    setRecipientAddress(data.recipientAddress ?? "");
    setSubject(data.subject);
    setBody(data.body);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void api<Company[]>("/api/companies").then(setCompanies).catch(() => setMessage("Could not load companies"));
      if (letterId) {
        api<LetterDetail>(`/api/letters/${letterId}`)
          .then(hydrate)
          .catch((e) => setMessage(e instanceof Error ? e.message : "Could not load letter"));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [letterId]);

  const isDraft = !letter || letter.status === "DRAFT";
  const payload = () => ({ companyId, recipientName, recipientAddress, subject, body });

  function pickCompany(id: string) {
    setCompanyId(id);
    const c = companies.find((x) => x.id === id);
    if (c) {
      setRecipientName(c.legalName || c.name);
      setRecipientAddress(c.address ?? "");
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const reload = async () => hydrate(await api<LetterDetail>(`/api/letters/${letterId}`));

  const save = () =>
    run(async () => {
      if (!letterId) {
        const created = await api<{ id: string }>("/api/letters", { method: "POST", ...jsonBody(payload()) });
        router.push(`/letters/${created.id}`);
        return;
      }
      await api(`/api/letters/${letterId}`, { method: "PATCH", ...jsonBody(payload()) });
      await reload();
      setMessage("Draft saved");
    });

  const issue = () =>
    run(async () => {
      if (!letterId) return;
      await api(`/api/letters/${letterId}`, { method: "PATCH", ...jsonBody(payload()) });
      await api(`/api/letters/${letterId}/issue`, { method: "POST", ...jsonBody({ idempotencyKey: issueKey.current }) });
      await reload();
      setMessage("Letter issued");
    });

  const discard = () =>
    run(async () => {
      await api(`/api/letters/${letterId}`, { method: "DELETE" });
      router.push("/letters");
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/letters" className="text-sm text-slate-600 underline">← All letters</Link>
        {letter ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{letter.number ?? "Draft letter"}</span>
            <StatusBadge status={letter.status} />
            {letter.isIssued ? (
              <a className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm" href={`/api/letters/${letter.id}/pdf`}>Download PDF</a>
            ) : null}
          </div>
        ) : null}
      </div>

      {message ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800">{message}</p> : null}

      <section className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className={label}>Fill from a client (optional)</span>
          <select className={input} value={companyId} disabled={!isDraft} onChange={(e) => pickCompany(e.target.value)}>
            <option value="">No client</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className={label}>Recipient</span>
          <input className={input} value={recipientName} disabled={!isDraft} onChange={(e) => setRecipientName(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className={label}>Address</span>
          <input className={input} value={recipientAddress} disabled={!isDraft} onChange={(e) => setRecipientAddress(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className={label}>Subject</span>
          <input className={input} value={subject} disabled={!isDraft} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className={label}>Letter (leave a blank line between paragraphs)</span>
          <textarea className={input} rows={12} value={body} disabled={!isDraft} onChange={(e) => setBody(e.target.value)} />
        </label>
      </section>

      {isDraft ? (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !recipientName || !subject || !body} onClick={save} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save draft</button>
          {letterId ? (
            <>
              <button disabled={busy} onClick={issue} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Issue letter</button>
              <button disabled={busy} onClick={discard} className="rounded-xl border border-rose-200 px-4 py-2 text-sm text-rose-700 disabled:opacity-50">Delete draft</button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
