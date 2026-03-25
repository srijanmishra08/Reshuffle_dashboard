"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { saveFreelancerNames } from "@/lib/freelancer-store";

type FreelancerRow = {
  id: string;
  freelancer: string;
  skill: string;
  availability: string;
  project: string;
  utilization: string;
  payout: string;
  performance: string;
};

const initialRows: FreelancerRow[] = [
  {
    id: "fr-1",
    freelancer: "Priya R",
    skill: "Video Editing",
    availability: "20 hrs/week",
    project: "Campaign Launch Kit",
    utilization: "78%",
    payout: "35000",
    performance: "4.7/5",
  },
  {
    id: "fr-2",
    freelancer: "Aman S",
    skill: "Performance Marketing",
    availability: "15 hrs/week",
    project: "Lead Gen Sprint",
    utilization: "91%",
    payout: "42000",
    performance: "4.4/5",
  },
  {
    id: "fr-3",
    freelancer: "Disha T",
    skill: "UI/Visual Design",
    availability: "10 hrs/week",
    project: "Website Revamp",
    utilization: "103%",
    payout: "38000",
    performance: "4.2/5",
  },
];

export default function FreelancersPage() {
  const [rows, setRows] = useState<FreelancerRow[]>(initialRows);

  function updateRow(id: string, field: keyof Omit<FreelancerRow, "id">, value: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        id: `fr-${Date.now()}`,
        freelancer: "",
        skill: "",
        availability: "",
        project: "",
        utilization: "",
        payout: "",
        performance: "",
      },
    ]);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  useEffect(() => {
    const names = rows.map((r) => r.freelancer).filter((n) => n.trim());
    saveFreelancerNames(names);
  }, [rows]);

  return (
    <DashboardShell title="Freelancers Sheet" subtitle="Editable Excel-style tracker for skills, allocation, utilization, and payouts.">
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={addRow} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Add Row
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Freelancer</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Primary Skill</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Availability</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Current Project</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Utilization</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Monthly Payout (Rs)</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Performance</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                <td className="border border-slate-200 px-2 py-1">
                  <input value={row.freelancer} onChange={(event) => updateRow(row.id, "freelancer", event.target.value)} className="w-full rounded px-2 py-1" />
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  <input value={row.skill} onChange={(event) => updateRow(row.id, "skill", event.target.value)} className="w-full rounded px-2 py-1" />
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  <input value={row.availability} onChange={(event) => updateRow(row.id, "availability", event.target.value)} className="w-full rounded px-2 py-1" />
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  <input value={row.project} onChange={(event) => updateRow(row.id, "project", event.target.value)} className="w-full rounded px-2 py-1" />
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  <input value={row.utilization} onChange={(event) => updateRow(row.id, "utilization", event.target.value)} className="w-full rounded px-2 py-1" />
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  <input value={row.payout} onChange={(event) => updateRow(row.id, "payout", event.target.value)} className="w-full rounded px-2 py-1" />
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  <input value={row.performance} onChange={(event) => updateRow(row.id, "performance", event.target.value)} className="w-full rounded px-2 py-1" />
                </td>
                <td className="border border-slate-200 px-2 py-1">
                  <button type="button" onClick={() => removeRow(row.id)} className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}
