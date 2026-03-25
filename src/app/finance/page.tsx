"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

type RevenueRow = {
  id: string;
  source: string;
  unitEconomics: string;
  projection: string;
  fixedHead: string;
  fixedAmount: string;
};

type ExpenseRow = {
  id: string;
  head: string;
  amount: string;
};

const quarter1Initial: RevenueRow[] = [
  { id: "q1-1", source: "FAAS", unitEconomics: "3 clients x 10k", projection: "30000", fixedHead: "Team Salary", fixedAmount: "15000" },
  { id: "q1-2", source: "Premium Subscriptions", unitEconomics: "50 x 799", projection: "39950", fixedHead: "Subscriptions", fixedAmount: "4000" },
  { id: "q1-3", source: "Boosts", unitEconomics: "100 x 2 x 50", projection: "10000", fixedHead: "Marketing", fixedAmount: "35000" },
  { id: "q1-4", source: "Collab Events", unitEconomics: "2 x 1000", projection: "2000", fixedHead: "Operations", fixedAmount: "7500" },
  { id: "q1-5", source: "Bootcamp Events", unitEconomics: "1 x 10000", projection: "10000", fixedHead: "Contingency", fixedAmount: "10000" },
];

const quarter2Initial: RevenueRow[] = [
  { id: "q2-1", source: "FAAS", unitEconomics: "", projection: "50000", fixedHead: "Team Salary", fixedAmount: "30000" },
  { id: "q2-2", source: "Premium", unitEconomics: "80 x 799", projection: "63920", fixedHead: "Subscriptions", fixedAmount: "4000" },
  { id: "q2-3", source: "Boosts", unitEconomics: "160 x 2 x 50", projection: "16000", fixedHead: "Marketing", fixedAmount: "50000" },
  { id: "q2-4", source: "Collab Events", unitEconomics: "", projection: "2000", fixedHead: "Operations", fixedAmount: "10000" },
  { id: "q2-5", source: "Bootcamps", unitEconomics: "2 x 10000", projection: "20000", fixedHead: "Contingency", fixedAmount: "20000" },
];

const quarter3Initial: RevenueRow[] = [
  { id: "q3-1", source: "FAAS", unitEconomics: "", projection: "80000", fixedHead: "Team Salary", fixedAmount: "50000" },
  { id: "q3-2", source: "Premium", unitEconomics: "200 x 799", projection: "159800", fixedHead: "Subscriptions", fixedAmount: "10000" },
  { id: "q3-3", source: "Boosts", unitEconomics: "300 x 2 x 50", projection: "30000", fixedHead: "Marketing", fixedAmount: "100000" },
  { id: "q3-4", source: "Collab Events", unitEconomics: "", projection: "4000", fixedHead: "Operations", fixedAmount: "20000" },
  { id: "q3-5", source: "Bootcamps", unitEconomics: "3 x 10000", projection: "30000", fixedHead: "Contingency", fixedAmount: "40000" },
];

const startingExpensesInitial: ExpenseRow[] = [
  { id: "e-1", head: "Meeting Spendings", amount: "0" },
  { id: "e-2", head: "Legal", amount: "15000" },
  { id: "e-3", head: "Trailer Videos", amount: "25000" },
  { id: "e-4", head: "Bank Account Setup", amount: "50000" },
  { id: "e-5", head: "Distribution Setups", amount: "9000" },
  { id: "e-6", head: "Subscriptions", amount: "8000" },
  { id: "e-7", head: "Website Domain", amount: "4000" },
  { id: "e-8", head: "Gifts", amount: "20000" },
];

function sumRows(rows: RevenueRow[], key: "projection" | "fixedAmount") {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function sumExpenses(rows: ExpenseRow[]) {
  return rows.reduce((total, row) => total + Number(row.amount || 0), 0);
}

type EditableRevenueTableProps = {
  title: string;
  rows: RevenueRow[];
  setRows: React.Dispatch<React.SetStateAction<RevenueRow[]>>;
};

function EditableRevenueTable({ title, rows, setRows }: EditableRevenueTableProps) {
  function updateRow(id: string, field: keyof Omit<RevenueRow, "id">, value: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: `${title}-${Date.now()}`,
        source: "",
        unitEconomics: "",
        projection: "",
        fixedHead: "",
        fixedAmount: "",
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <button type="button" onClick={addRow} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Add Row
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Revenue Source</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Unit Economics</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Monthly Projection (Rs)</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Fixed Spending</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Amount (Rs)</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1"><input value={row.source} onChange={(event) => updateRow(row.id, "source", event.target.value)} className="w-full rounded px-2 py-1" /></td>
                <td className="border border-slate-200 px-2 py-1"><input value={row.unitEconomics} onChange={(event) => updateRow(row.id, "unitEconomics", event.target.value)} className="w-full rounded px-2 py-1" /></td>
                <td className="border border-slate-200 px-2 py-1"><input value={row.projection} onChange={(event) => updateRow(row.id, "projection", event.target.value)} className="w-full rounded px-2 py-1" /></td>
                <td className="border border-slate-200 px-2 py-1"><input value={row.fixedHead} onChange={(event) => updateRow(row.id, "fixedHead", event.target.value)} className="w-full rounded px-2 py-1" /></td>
                <td className="border border-slate-200 px-2 py-1"><input value={row.fixedAmount} onChange={(event) => updateRow(row.id, "fixedAmount", event.target.value)} className="w-full rounded px-2 py-1" /></td>
                <td className="border border-slate-200 px-2 py-1">
                  <button type="button" onClick={() => removeRow(row.id)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">Delete</button>
                </td>
              </tr>
            ))}
            <tr className="bg-emerald-50 font-semibold">
              <td className="border border-slate-200 px-3 py-2">Total</td>
              <td className="border border-slate-200 px-3 py-2">-</td>
              <td className="border border-slate-200 px-3 py-2">{sumRows(rows, "projection")}</td>
              <td className="border border-slate-200 px-3 py-2">Total</td>
              <td className="border border-slate-200 px-3 py-2">{sumRows(rows, "fixedAmount")}</td>
              <td className="border border-slate-200 px-3 py-2">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function FinancePage() {
  const [quarter1Rows, setQuarter1Rows] = useState<RevenueRow[]>(quarter1Initial);
  const [quarter2Rows, setQuarter2Rows] = useState<RevenueRow[]>(quarter2Initial);
  const [quarter3Rows, setQuarter3Rows] = useState<RevenueRow[]>(quarter3Initial);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>(startingExpensesInitial);

  function updateExpenseRow(id: string, field: keyof Omit<ExpenseRow, "id">, value: string) {
    setExpenseRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addExpenseRow() {
    setExpenseRows((current) => [...current, { id: `e-${Date.now()}`, head: "", amount: "" }]);
  }

  function removeExpenseRow(id: string) {
    setExpenseRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <DashboardShell title="Finance Sheets" subtitle="Editable spreadsheet-style planning for revenue, spending, and startup costs.">
      <EditableRevenueTable title="Month 1-3 (Pre-Seed Stage / 1k Users)" rows={quarter1Rows} setRows={setQuarter1Rows} />
      <EditableRevenueTable title="Month 4-6 (After Seed Round / Growth)" rows={quarter2Rows} setRows={setQuarter2Rows} />
      <EditableRevenueTable title="Month 7-12 (Expansion Stage)" rows={quarter3Rows} setRows={setQuarter3Rows} />

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Starting Expenses</h3>
          <button type="button" onClick={addExpenseRow} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Add Row
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Expense Head</th>
                <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Amount (Rs)</th>
                <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {expenseRows.map((row) => (
                <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                  <td className="border border-slate-200 px-2 py-1"><input value={row.head} onChange={(event) => updateExpenseRow(row.id, "head", event.target.value)} className="w-full rounded px-2 py-1" /></td>
                  <td className="border border-slate-200 px-2 py-1"><input value={row.amount} onChange={(event) => updateExpenseRow(row.id, "amount", event.target.value)} className="w-full rounded px-2 py-1" /></td>
                  <td className="border border-slate-200 px-2 py-1">
                    <button type="button" onClick={() => removeExpenseRow(row.id)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">Delete</button>
                  </td>
                </tr>
              ))}
              <tr className="bg-emerald-50 font-semibold">
                <td className="border border-slate-200 px-3 py-2">Total</td>
                <td className="border border-slate-200 px-3 py-2">{sumExpenses(expenseRows)}</td>
                <td className="border border-slate-200 px-3 py-2">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
