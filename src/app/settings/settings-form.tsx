"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

type Settings = {
  legalName: string;
  address: string;
  stateCode: string;
  gstin: string;
  pan: string;
  bankDetails: { accountName: string; accountNumber: string; ifsc: string; bankName: string };
  defaultTerms: string;
  signatoryName: string;
  signatoryTitle: string;
  fyStartMonth: number;
};

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

export function SettingsForm() {
  const [form, setForm] = useState<Settings | null>(null);
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/settings");
      if (response.status === 403) {
        setMessage("Only admins can view settings.");
        return;
      }
      if (!response.ok) {
        setMessage("Could not load settings.");
        return;
      }
      const json = (await response.json()) as { data: Settings };
      setForm(json.data);
      setMessage("");
    })();
  }, []);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function setBank(key: keyof Settings["bankDetails"], value: string) {
    setForm((current) => (current ? { ...current, bankDetails: { ...current.bankDetails, [key]: value } } : current));
  }

  async function save() {
    if (!form) return;
    setMessage("Saving...");
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setMessage(response.ok ? "Saved." : "Could not save. Check GSTIN and PAN formats.");
  }

  const field = (label: string, node: React.ReactNode) => (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {node}
    </label>
  );

  return (
    <DashboardShell title="Settings" subtitle="Organisation, tax and signatory details used on every document.">
      {!form ? (
        <p className="text-sm text-slate-600">{message}</p>
      ) : (
        <div className="max-w-3xl space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Legal name", <input className={inputClass} value={form.legalName} onChange={(e) => set("legalName", e.target.value)} />)}
            {field("State code (GST)", <input className={inputClass} value={form.stateCode} onChange={(e) => set("stateCode", e.target.value)} />)}
            {field("GSTIN", <input className={inputClass} value={form.gstin} onChange={(e) => set("gstin", e.target.value)} />)}
            {field("PAN", <input className={inputClass} value={form.pan} onChange={(e) => set("pan", e.target.value)} />)}
          </div>
          {field("Address", <textarea className={inputClass} rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Bank account name", <input className={inputClass} value={form.bankDetails.accountName} onChange={(e) => setBank("accountName", e.target.value)} />)}
            {field("Bank name", <input className={inputClass} value={form.bankDetails.bankName} onChange={(e) => setBank("bankName", e.target.value)} />)}
            {field("Account number", <input className={inputClass} value={form.bankDetails.accountNumber} onChange={(e) => setBank("accountNumber", e.target.value)} />)}
            {field("IFSC", <input className={inputClass} value={form.bankDetails.ifsc} onChange={(e) => setBank("ifsc", e.target.value)} />)}
            {field("Signatory name", <input className={inputClass} value={form.signatoryName} onChange={(e) => set("signatoryName", e.target.value)} />)}
            {field("Signatory title", <input className={inputClass} value={form.signatoryTitle} onChange={(e) => set("signatoryTitle", e.target.value)} />)}
            {field(
              "Financial year starts in month (1-12)",
              <input className={inputClass} type="number" min={1} max={12} value={form.fyStartMonth} onChange={(e) => set("fyStartMonth", Number(e.target.value))} />
            )}
          </div>
          {field("Default terms", <textarea className={inputClass} rows={4} value={form.defaultTerms} onChange={(e) => set("defaultTerms", e.target.value)} />)}
          <p className="text-xs text-slate-500">Logo and signature uploads arrive with the document engine (Phase 2).</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Save settings
            </button>
            <span className="text-sm text-slate-600">{message}</span>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
