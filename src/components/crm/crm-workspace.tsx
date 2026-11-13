"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, jsonBody } from "@/lib/api";
import {
  formatDate,
  isOverdue,
  lifecycleStages,
  type Company,
  type FollowUp,
  type Lifecycle,
  type Vertical,
} from "@/lib/crm-types";
import { FollowUpsPanel } from "@/components/crm/followups-panel";
import { LifecycleBoard } from "@/components/crm/lifecycle-board";

const inputClass = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";

export function CrmWorkspace() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [view, setView] = useState<"table" | "board">("table");
  const [q, setQ] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [verticalId, setVerticalId] = useState("");
  const [message, setMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [newVertical, setNewVertical] = useState("");
  const [newSource, setNewSource] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (lifecycle) params.set("lifecycle", lifecycle);
    if (verticalId) params.set("verticalId", verticalId);

    const [companyRows, followUpRows] = await Promise.all([
      api<Company[]>(`/api/companies?${params.toString()}`),
      api<FollowUp[]>("/api/followups"),
    ]);
    setCompanies(companyRows);
    setFollowUps(followUpRows);
  }, [q, lifecycle, verticalId]);

  useEffect(() => {
    void api<Vertical[]>("/api/verticals").then(setVerticals).catch(() => setMessage("Could not load verticals"));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error: Error) => setMessage(error.message));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load().catch(() => setMessage("Could not refresh. Showing the last loaded data."));
      }
    }, 30000);
    return () => window.clearInterval(poll);
  }, [load]);

  async function createCompany(event: FormEvent) {
    event.preventDefault();
    try {
      await api<Company>("/api/companies", {
        method: "POST",
        ...jsonBody({ name: newName, verticalId: newVertical || undefined, source: newSource || undefined }),
      });
      setNewName("");
      setNewSource("");
      setMessage("Company added.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add company");
    }
  }

  async function moveCompany(company: Company, to: Lifecycle) {
    const previous = companies;
    setCompanies((rows) => rows.map((row) => (row.id === company.id ? { ...row, lifecycle: to } : row)));
    try {
      await api<Company>(`/api/companies/${company.id}`, { method: "PATCH", ...jsonBody({ lifecycle: to }) });
    } catch (error) {
      setCompanies(previous);
      setMessage(error instanceof Error ? error.message : "Could not move company");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <form onSubmit={(event) => void createCompany(event)} className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="flex-1 text-xs font-medium text-slate-600">
            New company
            <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Company name" className={`${inputClass} mt-1 w-full`} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Vertical
            <select value={newVertical} onChange={(e) => setNewVertical(e.target.value)} className={`${inputClass} mt-1 block`}>
              <option value="">None</option>
              {verticals.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Source
            <input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="Referral, event..." className={`${inputClass} mt-1 block`} />
          </label>
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Add
          </button>
        </form>
        <FollowUpsPanel items={followUps} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, legal name, GSTIN" className={`${inputClass} w-64`} />
        <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value)} className={inputClass}>
          <option value="">All lifecycle stages</option>
          {lifecycleStages.map((stage) => (
            <option key={stage} value={stage}>{stage}</option>
          ))}
        </select>
        <select value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className={inputClass}>
          <option value="">All verticals</option>
          {verticals.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <div className="ml-auto inline-flex overflow-hidden rounded-xl border border-slate-200 text-sm">
          {(["table", "board"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`px-3 py-2 capitalize ${view === mode ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      {view === "board" ? (
        <LifecycleBoard companies={companies} onMove={moveCompany} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Lifecycle</th>
                <th className="px-4 py-3">Vertical</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Next action</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No companies yet.</td>
                </tr>
              ) : null}
              {companies.map((company) => (
                <tr key={company.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/crm/${company.id}`} className="font-medium text-slate-900 hover:underline">{company.name}</Link>
                  </td>
                  <td className="px-4 py-3">{company.lifecycle}</td>
                  <td className="px-4 py-3">{company.verticalName ?? ""}</td>
                  <td className="px-4 py-3">{company.source ?? ""}</td>
                  <td className={`px-4 py-3 ${isOverdue(company.nextActionAt) ? "font-medium text-red-700" : ""}`}>
                    {formatDate(company.nextActionAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
