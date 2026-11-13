"use client";

import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR, toPaise } from "@/server/lib/money";
import type { Aging, Category, GstReport, LedgerKind, LedgerRow, MonthlySummary } from "@/lib/finance-types";
import { PlanTab } from "@/components/finance/plan-tab";

const tabs = ["Ledger", "Receivables", "Monthly", "GST", "Plan"] as const;
type Tab = (typeof tabs)[number];

function currentFy(now = new Date()): number {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function FinanceWorkspace() {
  const [tab, setTab] = useState<Tab>("Ledger");
  const [fy, setFy] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setFy(currentFy()), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${tab === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
          >
            {t}
          </button>
        ))}
        {fy !== null && (tab === "Monthly" || tab === "GST") ? (
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            Financial year
            <select value={fy} onChange={(e) => setFy(Number(e.target.value))} className="rounded-md border border-slate-300 px-2 py-1">
              {[0, 1, 2, 3].map((i) => {
                const y = currentFy() - i;
                return <option key={y} value={y}>{`${y}-${String((y + 1) % 100).padStart(2, "0")}`}</option>;
              })}
            </select>
          </label>
        ) : null}
      </div>

      {tab === "Ledger" ? <LedgerTab /> : null}
      {tab === "Receivables" ? <ReceivablesTab /> : null}
      {tab === "Monthly" && fy !== null ? <MonthlyTab fy={fy} /> : null}
      {tab === "GST" && fy !== null ? <GstTab fy={fy} /> : null}
      {tab === "Plan" ? <PlanTab /> : null}
    </div>
  );
}

/** Loads a REST resource, ignoring responses that arrive after the inputs changed. */
function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      api<T>(url)
        .then((d) => {
          if (!current) return;
          setData(d);
          setError("");
        })
        .catch((e) => {
          if (current) setError(e instanceof Error ? e.message : "Could not load");
        });
    }, 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [url, tick]);

  return { data, error, reload: () => setTick((n) => n + 1) };
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "rose" | "emerald" }) {
  const color = tone === "rose" ? "text-rose-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{head.map((h, i) => <th key={h} className={`px-3 py-2 ${i > 0 && /₹|Total|Balance|Tax|Income|Expense|Net|Taxable|Days|Count|Value/.test(h) ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="px-3 py-6 text-center text-slate-500">{text}</td></tr>;
}

function LedgerTab() {
  const [month, setMonth] = useState("");
  const [kind, setKind] = useState<LedgerKind | "">("");
  const query = new URLSearchParams({ ...(month ? { month } : {}), ...(kind ? { kind } : {}) }).toString();
  const entries = useResource<LedgerRow[]>(`/api/ledger?${query}`);
  const cats = useResource<Category[]>("/api/finance/categories");
  const [form, setForm] = useState({ kind: "EXPENSE" as LedgerKind, entryDate: "", amount: "", categoryId: "", description: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const categoryName = useCallback(
    (id: string | null) => cats.data?.find((c) => c.id === id)?.name ?? "",
    [cats.data]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    let amountPaise: number;
    try {
      amountPaise = toPaise(form.amount);
    } catch {
      setMessage("Enter the amount like 1500 or 1500.50");
      return;
    }
    setSaving(true);
    try {
      await api("/api/ledger", {
        method: "POST",
        ...jsonBody({
          kind: form.kind,
          entryDate: form.entryDate,
          amountPaise,
          categoryId: form.categoryId || null,
          description: form.description,
        }),
      });
      setForm((f) => ({ ...f, amount: "", description: "" }));
      entries.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save the entry");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api(`/api/ledger/${id}`, { method: "DELETE" });
      entries.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not delete the entry");
    }
  }

  async function addCategory() {
    const name = window.prompt("New category name");
    if (!name) return;
    try {
      await api("/api/finance/categories", { method: "POST", ...jsonBody({ name }) });
      cats.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not add the category");
    }
  }

  const rows = entries.data ?? [];
  const income = rows.filter((r) => r.kind === "INCOME").reduce((s, r) => s + r.amountPaise, 0);
  const expense = rows.filter((r) => r.kind === "EXPENSE").reduce((s, r) => s + r.amountPaise, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Income" value={formatINR(income)} tone="emerald" />
        <Stat label="Expense" value={formatINR(expense)} tone="rose" />
        <Stat label="Net" value={formatINR(income - expense)} />
      </div>

      <form onSubmit={submit} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-6">
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as LedgerKind })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Kind">
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
        </select>
        <input type="date" required value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Date" />
        <input required inputMode="decimal" placeholder="Amount (₹)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Amount" />
        <div className="flex gap-1">
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Category">
            <option value="">No category</option>
            {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" onClick={() => void addCategory()} className="rounded-md border border-slate-300 px-2 text-sm" title="New category">+</button>
        </div>
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" aria-label="Description" />
        <button disabled={saving} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">Add entry</button>
      </form>

      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <label className="flex items-center gap-2">Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" /></label>
        <select value={kind} onChange={(e) => setKind(e.target.value as LedgerKind | "")} className="rounded-md border border-slate-300 px-2 py-1" aria-label="Filter kind">
          <option value="">Income and expense</option>
          <option value="INCOME">Income only</option>
          <option value="EXPENSE">Expense only</option>
        </select>
      </div>

      {message || entries.error ? <p className="text-sm text-rose-600">{message || entries.error}</p> : null}

      <Table head={["Date", "Description", "Category", "Source", "Amount (₹)", ""]}>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-slate-100">
            <td className="px-3 py-2">{r.entryDate}</td>
            <td className="px-3 py-2">{r.description || (r.sourceType === "PAYMENT" ? "Invoice payment" : "")}</td>
            <td className="px-3 py-2">{categoryName(r.categoryId)}</td>
            <td className="px-3 py-2 text-xs text-slate-500">{r.sourceType === "MANUAL" ? "Manual" : "Automatic"}</td>
            <td className={`px-3 py-2 text-right ${r.kind === "INCOME" ? "text-emerald-700" : "text-rose-700"}`}>
              {r.kind === "INCOME" ? "+" : "−"}{formatINR(r.amountPaise)}
            </td>
            <td className="px-3 py-2 text-right">
              {r.sourceType === "MANUAL" ? <button onClick={() => void remove(r.id)} className="rounded border border-rose-300 px-2 py-0.5 text-xs text-rose-700">Delete</button> : null}
            </td>
          </tr>
        ))}
        {rows.length === 0 ? <Empty cols={6} text="No entries for this filter." /> : null}
      </Table>
    </div>
  );
}

function ReceivablesTab() {
  const { data, error } = useResource<Aging>("/api/finance/receivables");
  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-5">
        {(data?.buckets ?? []).map((b) => (
          <Stat key={b.bucket} label={b.bucket === "NOT_DUE" ? "Not due" : `${b.bucket} days`} value={formatINR(b.outstandingPaise)} tone={b.bucket === "90+" && b.count > 0 ? "rose" : undefined} />
        ))}
      </div>
      <p className="text-sm text-slate-600">Total outstanding {formatINR(data?.totalOutstandingPaise ?? 0)}{data ? `, as of ${data.asOf}` : ""}. Days are counted from the due date.</p>
      <Table head={["Invoice", "Client", "Due", "Days past due", "Balance (₹)"]}>
        {(data?.invoices ?? []).map((i) => (
          <tr key={i.id} className="border-t border-slate-100">
            <td className="px-3 py-2 font-medium"><a href={`/invoices/${i.id}`}>{i.number ?? "Draft"}</a></td>
            <td className="px-3 py-2">{i.companyName}</td>
            <td className="px-3 py-2">{i.dueDate ?? ""}</td>
            <td className="px-3 py-2 text-right">{i.daysPastDue > 0 ? i.daysPastDue : "–"}</td>
            <td className="px-3 py-2 text-right">{formatINR(i.outstandingPaise)}</td>
          </tr>
        ))}
        {data && data.invoices.length === 0 ? <Empty cols={5} text="Nothing outstanding." /> : null}
      </Table>
    </div>
  );
}

function MonthlyTab({ fy }: { fy: number }) {
  const { data, error } = useResource<MonthlySummary>(`/api/finance/monthly?fy=${fy}`);
  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Income" value={formatINR(data?.incomePaise ?? 0)} tone="emerald" />
        <Stat label="Expense" value={formatINR(data?.expensePaise ?? 0)} tone="rose" />
        <Stat label="Net" value={formatINR((data?.incomePaise ?? 0) - (data?.expensePaise ?? 0))} />
      </div>
      <Table head={["Month", "Income (₹)", "Expense (₹)", "Net (₹)"]}>
        {(data?.months ?? []).map((m) => (
          <tr key={m.month} className="border-t border-slate-100">
            <td className="px-3 py-2">{monthLabel(m.month)}</td>
            <td className="px-3 py-2 text-right">{formatINR(m.incomePaise)}</td>
            <td className="px-3 py-2 text-right">{formatINR(m.expensePaise)}</td>
            <td className={`px-3 py-2 text-right font-medium ${m.netPaise < 0 ? "text-rose-700" : ""}`}>{formatINR(m.netPaise)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function GstTab({ fy }: { fy: number }) {
  const { data, error } = useResource<GstReport>(`/api/finance/gst?fy=${fy}`);
  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Taxable value" value={formatINR(data?.totals.taxableValuePaise ?? 0)} />
        <Stat label="CGST" value={formatINR(data?.totals.cgstPaise ?? 0)} />
        <Stat label="SGST" value={formatINR(data?.totals.sgstPaise ?? 0)} />
        <Stat label="IGST" value={formatINR(data?.totals.igstPaise ?? 0)} />
      </div>
      <Table head={["Month", "Invoice count", "Taxable (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Invoice value (₹)"]}>
        {(data?.months ?? []).map((m) => (
          <tr key={m.month} className="border-t border-slate-100">
            <td className="px-3 py-2">{monthLabel(m.month)}</td>
            <td className="px-3 py-2 text-right">{m.invoiceCount}</td>
            <td className="px-3 py-2 text-right">{formatINR(m.taxableValuePaise)}</td>
            <td className="px-3 py-2 text-right">{formatINR(m.cgstPaise)}</td>
            <td className="px-3 py-2 text-right">{formatINR(m.sgstPaise)}</td>
            <td className="px-3 py-2 text-right">{formatINR(m.igstPaise)}</td>
            <td className="px-3 py-2 text-right">{formatINR(m.invoiceValuePaise)}</td>
          </tr>
        ))}
        {data && data.months.length === 0 ? <Empty cols={7} text="No issued invoices in this year." /> : null}
      </Table>
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>{data?.b2b.length ?? 0} B2B invoices with GSTIN, {data?.b2c.length ?? 0} B2C.</span>
        <a href={`/api/finance/gst?fy=${fy}&format=csv`} className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700">Download B2B CSV</a>
      </div>
    </div>
  );
}
