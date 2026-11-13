"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import { paiseToRupees, rupeesToPaise, type WorkOrderDetail } from "@/lib/billing-types";
import type { Company } from "@/lib/crm-types";
import { StatusBadge } from "@/components/billing/status-badge";

type Line = { description: string; sacCode: string; quantity: string; rate: string; taxable: boolean };

const blankLine = (): Line => ({ description: "", sacCode: "", quantity: "1", rate: "", taxable: true });
const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const label = "text-xs font-medium uppercase tracking-wide text-slate-500";

export function WorkOrderEditor({ workOrderId }: { workOrderId?: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<WorkOrderDetail | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [department, setDepartment] = useState("");
  const [jobDetails, setJobDetails] = useState("");
  const [comments, setComments] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // One key per page load: a double click or retry reuses it, so no second number is burned.
  const issueKey = useRef(crypto.randomUUID());

  function hydrate(data: WorkOrderDetail) {
    setOrder(data);
    setCompanyId(data.companyId);
    setCustomerRef(data.customerRef ?? "");
    setRequestedBy(data.requestedBy ?? "");
    setDepartment(data.department ?? "");
    setJobDetails(data.jobDetails ?? "");
    setComments(data.comments ?? "");
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
      if (workOrderId) {
        api<WorkOrderDetail>(`/api/work-orders/${workOrderId}`)
          .then(hydrate)
          .catch((e) => setMessage(e instanceof Error ? e.message : "Could not load work order"));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [workOrderId]);

  const isDraft = !order || order.status === "DRAFT";
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
    return { companyId, customerRef, requestedBy, department, jobDetails, comments, items };
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

  const reload = async () => hydrate(await api<WorkOrderDetail>(`/api/work-orders/${workOrderId}`));

  const save = () =>
    run(async () => {
      if (!workOrderId) {
        const created = await api<{ id: string }>("/api/work-orders", { method: "POST", ...jsonBody(payload()) });
        router.push(`/work-orders/${created.id}`);
        return;
      }
      await api(`/api/work-orders/${workOrderId}`, { method: "PATCH", ...jsonBody(payload()) });
      await reload();
      setMessage("Draft saved");
    });

  const issue = () =>
    run(async () => {
      if (!workOrderId) return;
      await api(`/api/work-orders/${workOrderId}`, { method: "PATCH", ...jsonBody(payload()) });
      await api(`/api/work-orders/${workOrderId}/issue`, { method: "POST", ...jsonBody({ idempotencyKey: issueKey.current }) });
      await reload();
      setMessage("Work order issued");
    });

  const discard = () =>
    run(async () => {
      await api(`/api/work-orders/${workOrderId}`, { method: "DELETE" });
      router.push("/work-orders");
    });

  const complete = () =>
    run(async () => {
      await api(`/api/work-orders/${workOrderId}/complete`, { method: "POST", ...jsonBody({ comments }) });
      await reload();
      setMessage("Marked as completed");
    });

  const cancel = () =>
    run(async () => {
      await api(`/api/work-orders/${workOrderId}/cancel`, { method: "POST", ...jsonBody({ reason: cancelReason }) });
      await reload();
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/work-orders" className="text-sm text-slate-600 underline">← All work orders</Link>
        {order ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{order.number ?? "Draft work order"}</span>
            <StatusBadge status={order.status} />
            {order.isIssued ? (
              <a className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm" href={`/api/work-orders/${order.id}/pdf`}>Download PDF</a>
            ) : null}
          </div>
        ) : null}
      </div>

      {message ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800">{message}</p> : null}

      <section className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className={label}>Client</span>
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
          <span className={label}>Customer ID / reference</span>
          <input className={input} value={customerRef} disabled={!isDraft} onChange={(e) => setCustomerRef(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className={label}>Requested by</span>
          <input className={input} value={requestedBy} disabled={!isDraft} onChange={(e) => setRequestedBy(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className={label}>Department</span>
          <input className={input} value={department} disabled={!isDraft} onChange={(e) => setDepartment(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className={label}>Job details</span>
          <textarea className={input} rows={3} value={jobDetails} disabled={!isDraft} onChange={(e) => setJobDetails(e.target.value)} />
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
        <span className={label}>Comments</span>
        <textarea className={input} rows={2} value={comments}
          disabled={!(isDraft || order?.status === "ISSUED")} onChange={(e) => setComments(e.target.value)} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        {order && order.subtotalPaise > 0 ? (
          <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1">
            <dt>Subtotal</dt><dd className="text-right">{formatINR(order.subtotalPaise)}</dd>
            {order.taxMode === "INTER" ? (
              <><dt>IGST</dt><dd className="text-right">{formatINR(order.igstPaise)}</dd></>
            ) : (
              <><dt>CGST</dt><dd className="text-right">{formatINR(order.cgstPaise)}</dd>
                <dt>SGST</dt><dd className="text-right">{formatINR(order.sgstPaise)}</dd></>
            )}
            <dt>Round off</dt><dd className="text-right">{formatINR(order.roundOffPaise)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{formatINR(order.totalPaise)}</dd>
          </dl>
        ) : (
          <p className="text-slate-600">Lines before tax: {formatINR(estimate)}. Save the draft to see GST, round-off and the total.</p>
        )}
        {order?.completedDate ? <p className="mt-2 text-slate-600">Completed on {order.completedDate}</p> : null}
      </section>

      {isDraft ? (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !companyId} onClick={save} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save draft</button>
          {workOrderId ? (
            <>
              <button disabled={busy} onClick={issue} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Issue work order</button>
              <button disabled={busy} onClick={discard} className="rounded-xl border border-rose-200 px-4 py-2 text-sm text-rose-700 disabled:opacity-50">Delete draft</button>
            </>
          ) : null}
        </div>
      ) : null}

      {order?.status === "ISSUED" ? (
        <>
          <section className="rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-semibold">Mark as completed</h2>
            <p className="mb-2 text-xs text-slate-600">Sets today as the completed date. Add any closing comments above first.</p>
            <button disabled={busy} onClick={complete} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Complete</button>
          </section>
          <section className="space-y-2 rounded-xl border border-rose-200 p-4">
            <h2 className="text-sm font-semibold text-rose-800">Cancel work order</h2>
            <div className="flex gap-2">
              <input className={input} placeholder="Reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              <button disabled={busy || cancelReason.trim().length < 3} onClick={cancel} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Cancel</button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
