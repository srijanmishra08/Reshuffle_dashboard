"use client";

import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { paiseToRupees, rupeesToPaise, type PersonDetail, type SalarySlipRow } from "@/lib/billing-types";
import { StatusBadge } from "@/components/billing/status-badge";

const input = "rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function PersonDetailView({ id }: { id: string }) {
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [slips, setSlips] = useState<SalarySlipRow[]>([]);
  const [slipsDenied, setSlipsDenied] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "", pan: "", bankAccount: "", bankIfsc: "" });
  const [slip, setSlip] = useState({ payPeriod: "", basic: "", other: "", deduction: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<PersonDetail>(`/api/people/${id}`)
      .then((p) => {
        setPerson(p);
        setForm({
          name: p.name,
          email: p.email ?? "",
          phone: p.phone ?? "",
          role: p.role,
          pan: p.pan ?? "",
          bankAccount: p.bankAccount ?? "",
          bankIfsc: p.bankIfsc ?? "",
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load person"));
    api<SalarySlipRow[]>(`/api/salary-slips?personId=${encodeURIComponent(id)}`)
      .then((rows) => setSlips(rows))
      .catch(() => setSlipsDenied(true));
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const isAdmin = person ? person.pan !== undefined : false;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!person) return;
    setBusy(true);
    setError("");
    setSaved("");
    const patch: Record<string, unknown> = {
      name: form.name,
      email: form.email || null,
      phone: form.phone,
      role: form.role,
      bankIfsc: form.bankIfsc || null,
    };
    // Secrets are sent only when changed, so a stale value is never re-saved.
    if (form.pan !== (person.pan ?? "")) patch.pan = form.pan || null;
    if (form.bankAccount !== (person.bankAccount ?? "")) patch.bankAccount = form.bankAccount || null;
    try {
      await api(`/api/people/${id}`, { method: "PATCH", ...jsonBody(patch) });
      setSaved("Saved");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function createSlip(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const amounts = [slip.basic, slip.other, slip.deduction].filter(Boolean).map(rupeesToPaise);
      if (amounts.some((n) => Number.isNaN(n))) throw new Error("Enter amounts as rupees, for example 25000 or 25000.50");
      const earnings = [{ label: "Basic", amountPaise: rupeesToPaise(slip.basic) }];
      if (slip.other) earnings.push({ label: "Other earnings", amountPaise: rupeesToPaise(slip.other) });
      const deductions = slip.deduction ? [{ label: "Deductions", amountPaise: rupeesToPaise(slip.deduction) }] : [];
      await api("/api/salary-slips", {
        method: "POST",
        ...jsonBody({ personId: id, payPeriod: slip.payPeriod, earnings, deductions }),
      });
      setSlip({ payPeriod: "", basic: "", other: "", deduction: "" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create slip");
    } finally {
      setBusy(false);
    }
  }

  async function issueSlip(slipId: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/salary-slips/${slipId}/issue`, {
        method: "POST",
        ...jsonBody({ idempotencyKey: `issue-${slipId}-${crypto.randomUUID()}` }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue slip");
    } finally {
      setBusy(false);
    }
  }

  if (!person) return <p className="text-sm text-slate-500">{error || "Loading…"}</p>;

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <form onSubmit={save} className="grid gap-2 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
        <input className={input} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!isAdmin} />
        <input className={input} placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={!isAdmin} />
        <input className={input} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!isAdmin} />
        <input className={input} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!isAdmin} />
        {isAdmin ? (
          <>
            <input className={input} placeholder="PAN" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} />
            <input className={input} placeholder="Bank account" value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
            <input className={input} placeholder="IFSC" value={form.bankIfsc} onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })} />
          </>
        ) : (
          <p className="text-sm text-slate-500 sm:col-span-2">
            PAN {person.panMasked ?? "not set"} · Bank {person.bankAccountMasked ?? "not set"}. Only admins can see or change these.
          </p>
        )}
        {isAdmin ? (
          <div className="flex items-center gap-3 sm:col-span-2">
            <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save</button>
            {saved ? <span className="text-sm text-emerald-700">{saved}</span> : null}
          </div>
        ) : null}
      </form>

      {slipsDenied ? (
        <p className="text-sm text-slate-500">Salary slips are visible to admins only.</p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Salary slips</h2>
          <form onSubmit={createSlip} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-5">
            <input className={input} type="month" value={slip.payPeriod} onChange={(e) => setSlip({ ...slip, payPeriod: e.target.value })} required />
            <input className={input} placeholder="Basic ₹" inputMode="decimal" value={slip.basic} onChange={(e) => setSlip({ ...slip, basic: e.target.value })} required />
            <input className={input} placeholder="Other ₹" inputMode="decimal" value={slip.other} onChange={(e) => setSlip({ ...slip, other: e.target.value })} />
            <input className={input} placeholder="Deductions ₹" inputMode="decimal" value={slip.deduction} onChange={(e) => setSlip({ ...slip, deduction: e.target.value })} />
            <button disabled={busy} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Create draft</button>
          </form>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Period</th><th className="px-3 py-2">Number</th><th className="px-3 py-2">Net</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {slips.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{s.payPeriod}</td>
                    <td className="px-3 py-2">{s.number ?? "Draft"}</td>
                    <td className="px-3 py-2">₹{paiseToRupees(s.netPaise)}</td>
                    <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-2">
                      {s.status === "DRAFT" ? (
                        <button disabled={busy} onClick={() => issueSlip(s.id)} className="text-sky-700 underline disabled:opacity-50">Issue</button>
                      ) : (
                        <a className="text-sky-700 underline" href={`/api/salary-slips/${s.id}/pdf`}>PDF</a>
                      )}
                    </td>
                  </tr>
                ))}
                {slips.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No salary slips yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
