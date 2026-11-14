"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

type FreelancerRow = { id: string } & Record<FieldKey, string>;

const columns = [
  { key: "freelancer", label: "Freelancer" },
  { key: "skill", label: "Primary Skill" },
  { key: "category", label: "Category" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "xHandle", label: "X" },
  { key: "website", label: "Website" },
  { key: "availability", label: "Availability" },
  { key: "project", label: "Current Project" },
  { key: "utilization", label: "Utilization" },
  { key: "payout", label: "Monthly Payout (Rs)" },
  { key: "performance", label: "Performance" },
] as const;

type FieldKey = (typeof columns)[number]["key"];

export default function FreelancersPage() {
  const [rows, setRows] = useState<FreelancerRow[]>([]);
  const [message, setMessage] = useState("Loading freelancers...");

  // Rows with edits that are not saved yet. A background refresh must never overwrite them,
  // and a response that arrives after a newer request is dropped.
  const dirtyIds = useRef(new Set<string>());
  const requestSeq = useRef(0);

  async function refreshRows() {
    const seq = ++requestSeq.current;
    const response = await fetch("/api/freelancers", { cache: "no-store" });
    const json = (await response.json()) as { data?: FreelancerRow[]; error?: string };

    if (!response.ok || !json.data) {
      throw new Error(json.error ?? "Could not load freelancers");
    }

    if (seq !== requestSeq.current) {
      return;
    }

    const fresh = json.data;
    setRows((current) =>
      fresh.map((row) => (dirtyIds.current.has(row.id) ? (current.find((c) => c.id === row.id) ?? row) : row))
    );
  }

  useEffect(() => {
    const run = async () => {
      try {
        await refreshRows();
        setMessage("Freelancer sheet synced with database.");
      } catch {
        setMessage("Could not load freelancers");
      }
    };

    void run();
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void refreshRows().catch(() => {
        setMessage("Could not refresh freelancers");
      });
    }, 20000);

    const onFocus = () => {
      void refreshRows().catch(() => {
        setMessage("Could not refresh freelancers");
      });
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  function updateRow(id: string, field: FieldKey, value: string) {
    dirtyIds.current.add(id);
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  async function addRow() {
    try {
      const response = await fetch("/api/freelancers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freelancer: "New Freelancer" }),
      });

      const json = (await response.json()) as { data?: FreelancerRow; error?: string };

      if (!response.ok || !json.data) {
        setMessage(json.error ?? "Could not add row");
        return;
      }

      setRows((current) => [...current, json.data as FreelancerRow]);
      setMessage("Added freelancer row.");
    } catch {
      setMessage("Could not add row");
    }
  }

  async function saveRowById(id: string) {
    const row = rows.find((entry) => entry.id === id);

    if (!row || !row.freelancer.trim()) {
      setMessage("Freelancer name is required");
      return;
    }

    try {
      const response = await fetch(`/api/freelancers/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(columns.map((c) => [c.key, row[c.key]]))),
      });

      const json = (await response.json()) as { data?: FreelancerRow; error?: string };

      if (!response.ok || !json.data) {
        setMessage(json.error ?? "Could not save row");
        return;
      }

      // If the row was edited again while this request was in flight, keep the newer text
      // (and keep it marked unsaved); otherwise take the server copy.
      const saved = json.data;
      const unchanged = (entry: FreelancerRow) => JSON.stringify(entry) === JSON.stringify(row);
      setRows((current) => {
        const entry = current.find((r) => r.id === row.id);
        if (entry && !unchanged(entry)) {
          return current;
        }
        dirtyIds.current.delete(row.id);
        return current.map((r) => (r.id === row.id ? saved : r));
      });
      setMessage(`Saved ${json.data.freelancer}.`);
    } catch {
      setMessage("Could not save row");
    }
  }

  async function removeRow(id: string) {
    try {
      const response = await fetch(`/api/freelancers/${id}`, {
        method: "DELETE",
      });

      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(json.error ?? "Could not delete row");
        return;
      }

      dirtyIds.current.delete(id);
      setRows((current) => current.filter((row) => row.id !== id));
      setMessage("Deleted freelancer row.");
    } catch {
      setMessage("Could not delete row");
    }
  }

  return (
    <DashboardShell title="Freelancers Sheet" subtitle="Editable tracker for freelancer contacts, skills, allocation, utilization, and payouts.">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{message}</p>
        <button type="button" onClick={addRow} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Add Row
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap border border-slate-200 px-3 py-2 text-left font-semibold">{c.label}</th>
              ))}
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className="border border-slate-200 px-2 py-1">
                    <input value={row[c.key]} onChange={(event) => updateRow(row.id, c.key, event.target.value)} onBlur={() => void saveRowById(row.id)} className="w-full min-w-32 rounded px-2 py-1" />
                  </td>
                ))}
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
