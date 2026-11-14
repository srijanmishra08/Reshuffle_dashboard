"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import {
  paiseToRupees,
  paymentMethods,
  rupeesToPaise,
  type InvoiceDetail,
} from "@/lib/billing-types";
import type { Company } from "@/lib/crm-types";
import { StatusBadge } from "@/components/billing/status-badge";

type Line = { description: string; sacCode: string; quantity: string; rate: string; taxable: boolean };

const blankLine = (): Line => ({ description: "", sacCode: "", quantity: "1", rate: "", taxable: true });
const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

export function InvoiceEditor({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // One key per issue attempt-set: a double click or retry reuses it, so no second number is burned.
  const issueKey = useRef(crypto.randomUUID());

  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState<(typeof paymentMethods)[number]>("BANK_TRANSFER");
  const [payRef, setPayRef] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  function hydrate(data: InvoiceDetail) {
    setInvoice(data);
    setCompanyId(data.companyId);
    setDueDate(data.dueDate ?? "");
    setNotes(data.notes ?? "");
    setLines(
      data.items.length
        ? data.items.map((i) => ({
            description: i.description,
            sacCode: i.sacCode ?? "",
            quantity: String(i.quantity),
            rate: paiseToRupees(i.ratePaise),
            taxable: i.taxable,
          }))
        : [blankLine()],
    );
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void api<Company[]>("/api/companies").then(setCompanies).catch(() => setMessage("Could not load companies"));
      if (invoiceId) {
        api<InvoiceDetail>(`/api/invoices/${invoiceId}`)
          .then(hydrate)
          .catch((e) => setMessage(e instanceof Error ? e.message : "Could not load invoice"));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [invoiceId]);

  const isDraft = !invoice || invoice.status === "DRAFT";
  const company = companies.find((c) => c.id === companyId);
  const estimate = lines.reduce((sum, l) => {
    const rate = rupeesToPaise(l.rate);
    const qty = Number(l.quantity);
    return Number.isFinite(rate) && Number.isInteger(qty) ? sum + rate * qty : sum;
  }, 0);

  function payload() {
    const items = lines.map((l) => ({
      description: l.description,
      sacCode: l.sacCode,
      quantity: Number(l.quantity),
      ratePaise: rupeesToPaise(l.rate),
      taxable: l.taxable,
    }));
    if (items.some((i) => Number.isNaN(i.ratePaise))) throw new Error("Enter every rate as rupees, for example 1500.00");
    return { companyId, dueDate: dueDate || null, notes, items };
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

  const save = () =>
    run(async () => {
      if (!invoiceId) {
        const created = await api<{ id: string }>("/api/invoices", { method: "POST", ...jsonBody(payload()) });
        router.push(`/invoices/${created.id}`);
        return;
      }
      await api(`/api/invoices/${invoiceId}`, { method: "PATCH", ...jsonBody(payload()) });
      hydrate(await api<InvoiceDetail>(`/api/invoices/${invoiceId}`));
      setMessage("Draft saved");
    });

  const issue = () =>
    run(async () => {
      if (!invoiceId) return;
      await api(`/api/invoices/${invoiceId}`, { method: "PATCH", ...jsonBody(payload()) });
      await api(`/api/invoices/${invoiceId}/issue`, { method: "POST", ...jsonBody({ idempotencyKey: issueKey.current }) });
      hydrate(await api<InvoiceDetail>(`/api/invoices/${invoiceId}`));
      setMessage("Invoice issued");
    });

  const discard = () =>
    run(async () => {
      await api(`/api/invoices/${invoiceId}`, { method: "DELETE" });
      router.push("/invoices");
    });

  const pay = () =>
    run(async () => {
      const amountPaise = rupeesToPaise(payAmount);
      if (Number.isNaN(amountPaise) || amountPaise <= 0) throw new Error("Enter a payment amount in rupees");
      await api(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        ...jsonBody({ amountPaise, paidAt: payDate, method: payMethod, reference: payRef }),
      });
      setPayAmount("");
      setPayRef("");
      hydrate(await api<InvoiceDetail>(`/api/invoices/${invoiceId}`));
    });

  const cancel = () =>
    run(async () => {
      await api(`/api/invoices/${invoiceId}/cancel`, { method: "POST", ...jsonBody({ reason: cancelReason }) });
      hydrate(await api<InvoiceDetail>(`/api/invoices/${invoiceId}`));
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/invoices" className="text-sm text-slate-600 underline">← All invoices</Link>
        {invoice ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{invoice.number ?? "Draft invoice"}</span>
            <StatusBadge status={invoice.status} overdue={Boolean(invoice.overdueAt)} />
            {invoice.isIssued ? (
              <a className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm" href={`/api/invoices/${invoice.id}/pdf`}>Download PDF</a>
            ) : null}
            {invoice.hasOriginalPdf ? (
              <a className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm" href={`/api/invoices/${invoice.id}/original`}>Original PDF</a>
            ) : null}
          </div>
        ) : null}
      </div>

      {message ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800">{message}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Client</span>
          <select className={input} value={companyId} disabled={!isDraft} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Choose a client</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {company ? (
            <span className="block text-xs text-slate-500">
              {company.gstin ? `GSTIN ${company.gstin}` : "No GSTIN"} · state {company.stateCode ?? "not set"} · tax mode is worked out on save
            </span>
          ) : null}
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Due date</span>
          <input type="date" className={input} value={dueDate} disabled={!isDraft} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Line items</h2>
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_7rem_5rem_8rem_auto]">
            <input className={input} placeholder="Description" value={l.description} disabled={!isDraft}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <input className={input} placeholder="SAC" value={l.sacCode} disabled={!isDraft}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, sacCode: e.target.value } : x)))} />
            <input className={input} placeholder="Qty" inputMode="numeric" value={l.quantity} disabled={!isDraft}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
            <input className={input} placeholder="Rate ₹" inputMode="decimal" value={l.rate} disabled={!isDraft}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={l.taxable} disabled={!isDraft}
                  onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, taxable: e.target.checked } : x)))} /> GST
              </label>
              {isDraft && lines.length > 1 ? (
                <button className="text-rose-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
              ) : null}
            </div>
          </div>
        ))}
        {isDraft ? (
          <button className="text-sm text-sky-700 underline" onClick={() => setLines([...lines, blankLine()])}>+ Add line</button>
        ) : null}
      </section>

      <section className="space-y-1 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</span>
        <textarea className={input} rows={2} value={notes} disabled={!isDraft} onChange={(e) => setNotes(e.target.value)} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        {invoice && invoice.status !== "DRAFT" || (invoice && invoice.subtotalPaise > 0) ? (
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1">
            <dt>Subtotal</dt><dd className="text-right">{formatINR(invoice.subtotalPaise)}</dd>
            {invoice.taxMode === "INTER" ? (
              <><dt>IGST</dt><dd className="text-right">{formatINR(invoice.igstPaise)}</dd></>
            ) : (
              <><dt>CGST</dt><dd className="text-right">{formatINR(invoice.cgstPaise)}</dd>
                <dt>SGST</dt><dd className="text-right">{formatINR(invoice.sgstPaise)}</dd></>
            )}
            <dt>Round off</dt><dd className="text-right">{formatINR(invoice.roundOffPaise)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatINR(invoice.totalPaise)}</dd>
            <dt>Paid</dt><dd className="text-right">{formatINR(invoice.paidPaise)}</dd>
            <dt className="font-semibold">Balance</dt><dd className="text-right font-semibold">{formatINR(invoice.outstandingPaise)}</dd>
          </dl>
        ) : (
          <p className="text-slate-600">Lines before tax: {formatINR(estimate)}. Save the draft to see GST, round-off and the total.</p>
        )}
      </section>

      {isDraft ? (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !companyId} onClick={save} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save draft</button>
          {invoiceId ? (
            <>
              <button disabled={busy} onClick={issue} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Issue invoice</button>
              <button disabled={busy} onClick={discard} className="rounded-xl border border-rose-200 px-4 py-2 text-sm text-rose-700 disabled:opacity-50">Delete draft</button>
            </>
          ) : null}
        </div>
      ) : null}

      {invoice && (invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID") ? (
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold">Record a payment</h2>
          <div className="grid gap-2 sm:grid-cols-5">
            <input className={input} placeholder="Amount ₹" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            <input className={input} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            <select className={input} value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
              {paymentMethods.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
            </select>
            <input className={input} placeholder="Reference" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            <button disabled={busy} onClick={pay} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record</button>
          </div>
        </section>
      ) : null}

      {invoice && invoice.payments.length > 0 ? (
        <section className="space-y-1 text-sm">
          <h2 className="font-semibold">Payments</h2>
          {invoice.payments.map((p) => (
            <p key={p.id} className="text-slate-700">
              {p.paidAt} · {formatINR(p.amountPaise)} · {p.method.replace("_", " ")}{p.reference ? ` · ${p.reference}` : ""}
            </p>
          ))}
        </section>
      ) : null}

      {invoice && invoice.status === "ISSUED" && invoice.paidPaise === 0 ? (
        <section className="space-y-2 rounded-xl border border-rose-200 p-4">
          <h2 className="text-sm font-semibold text-rose-800">Cancel with a credit note</h2>
          <p className="text-xs text-slate-600">Issued invoices are never edited. Cancelling raises a credit note in its own series.</p>
          <div className="flex gap-2">
            <input className={input} placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            <button disabled={busy || cancelReason.trim().length < 3} onClick={cancel} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Cancel invoice</button>
          </div>
        </section>
      ) : null}

      {invoice?.creditNote ? (
        <a className="text-sm text-sky-700 underline" href={`/api/invoices/${invoice.id}/credit-note/pdf`}>
          Credit note {invoice.creditNote.number} (PDF)
        </a>
      ) : null}
    </div>
  );
}
