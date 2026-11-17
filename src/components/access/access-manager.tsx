"use client";

import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import type { Company } from "@/lib/crm-types";
import { roleLabels } from "@/lib/schemas/access";
import { roleValues } from "@/server/roles";

type AccessRow = { email: string; role: keyof typeof roleLabels; linkedTo: string | null; hasSignedIn: boolean };
type Agency = { id: string; name: string; contactName: string | null; contactEmail: string | null; members: { freelancerId: string; name: string }[] };
type Freelancer = { id: string; freelancer: string };

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";
const card = "rounded-2xl border border-slate-200 bg-white p-4";
const th = "px-3 py-2";

const roleHelp: Record<string, string> = {
  ADMIN: "Everything, including this page.",
  MANAGER: "Everything except settings and access.",
  MEMBER: "Team dashboard without money documents.",
  CLIENT: "Client portal: their projects, invoices, proposals and forms.",
  AGENCY: "Partner portal: their freelancers' tasks and payouts.",
  FREELANCER: "Freelancer portal: their own tasks and payouts.",
};

export function AccessManager() {
  const [rows, setRows] = useState<AccessRow[] | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", role: "CLIENT", companyId: "", freelancerId: "", agencyId: "" });
  const [agencyForm, setAgencyForm] = useState({ name: "", contactName: "", contactEmail: "" });
  const [pick, setPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [access, ag] = await Promise.all([api<AccessRow[]>("/api/access"), api<Agency[]>("/api/agencies")]);
      setRows(access);
      setAgencies(ag);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load access");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      api<Company[]>("/api/companies").then(setCompanies).catch(() => setError("Could not load clients"));
      api<Freelancer[]>("/api/freelancers").then(setFreelancers).catch(() => setError("Could not load freelancers"));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
      if (done) setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function grant(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api("/api/access", { method: "POST", ...jsonBody(form) });
      setForm({ ...form, email: "" });
    }, `${form.email} can now sign in with that Google account at ${window.location.origin}/login`);
  }

  const needs = form.role === "CLIENT" ? "company" : form.role === "FREELANCER" ? "freelancer" : form.role === "AGENCY" ? "agency" : null;

  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}

      <section className={card}>
        <h3 className="text-sm font-semibold text-slate-800">Give someone access</h3>
        <p className="mt-1 text-xs text-slate-500">
          They sign in with the Google account for this email. There is no invitation email yet, so send them the sign-in link yourself.
        </p>
        <form onSubmit={grant} className="mt-3 grid items-end gap-3 md:grid-cols-4">
          <label className={label}>
            Email (Google account)
            <input required type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className={label}>
            Role
            <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleValues.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </label>
          {needs === "company" ? (
            <label className={label}>
              Client
              <select required className={input} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                <option value="">Choose…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {needs === "freelancer" ? (
            <label className={label}>
              Freelancer
              <select required className={input} value={form.freelancerId} onChange={(e) => setForm({ ...form, freelancerId: e.target.value })}>
                <option value="">Choose…</option>
                {freelancers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.freelancer}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {needs === "agency" ? (
            <label className={label}>
              Partner agency
              <select required className={input} value={form.agencyId} onChange={(e) => setForm({ ...form, agencyId: e.target.value })}>
                <option value="">Choose…</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Give access
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">{roleHelp[form.role]}</p>
      </section>

      <section className={card}>
        <h3 className="text-sm font-semibold text-slate-800">Who has access</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className={th}>Email</th>
                <th className={th}>Role</th>
                <th className={th}>Linked to</th>
                <th className={th}>Signed in</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows === null && !error ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-500">Loading...</td>
                </tr>
              ) : null}
              {rows?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-500">
                    No one has been added here yet. Admins named in the server settings can always sign in.
                  </td>
                </tr>
              ) : null}
              {rows?.map((r) => (
                <tr key={r.email} className="border-t border-slate-100">
                  <td className={th}>{r.email}</td>
                  <td className={th}>{roleLabels[r.role] ?? r.role}</td>
                  <td className={th}>{r.linkedTo ?? "—"}</td>
                  <td className={th}>{r.hasSignedIn ? "Yes" : "Not yet"}</td>
                  <td className={`${th} text-right`}>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Remove access for ${r.email}? They are signed out at once.`)) {
                          void run(() => api("/api/access", { method: "DELETE", ...jsonBody({ email: r.email }) }));
                        }
                      }}
                      className="text-xs text-rose-700 underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h3 className="text-sm font-semibold text-slate-800">Partner agencies</h3>
        <p className="mt-1 text-xs text-slate-500">An agency sign-in sees the tasks and payouts of the freelancers listed under it. A freelancer can be in one agency.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/api/agencies", { method: "POST", ...jsonBody(agencyForm) });
              setAgencyForm({ name: "", contactName: "", contactEmail: "" });
            });
          }}
          className="mt-3 grid items-end gap-3 md:grid-cols-4"
        >
          <label className={label}>
            Agency name
            <input required className={input} value={agencyForm.name} onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })} />
          </label>
          <label className={label}>
            Contact name
            <input className={input} value={agencyForm.contactName} onChange={(e) => setAgencyForm({ ...agencyForm, contactName: e.target.value })} />
          </label>
          <label className={label}>
            Contact email
            <input type="email" className={input} value={agencyForm.contactEmail} onChange={(e) => setAgencyForm({ ...agencyForm, contactEmail: e.target.value })} />
          </label>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Add agency
          </button>
        </form>

        <div className="mt-4 space-y-3">
          {agencies.length === 0 ? <p className="text-sm text-slate-500">No agencies yet.</p> : null}
          {agencies.map((a) => {
            const taken = new Set(agencies.flatMap((x) => x.members.map((m) => m.freelancerId)));
            return (
              <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-500">{[a.contactName, a.contactEmail].filter(Boolean).join(" · ") || "No contact"}</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Delete ${a.name}? Its sign-ins stop working and its freelancers are no longer grouped.`)) {
                        void run(() => api(`/api/agencies/${a.id}`, { method: "DELETE" }));
                      }
                    }}
                    className="text-xs text-rose-700 underline disabled:opacity-50"
                  >
                    Delete agency
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {a.members.length === 0 ? <span className="text-xs text-slate-500">No freelancers yet.</span> : null}
                  {a.members.map((m) => (
                    <span key={m.freelancerId} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-800">
                      {m.name}
                      <button
                        disabled={busy}
                        aria-label={`Remove ${m.name} from ${a.name}`}
                        onClick={() => void run(() => api(`/api/agencies/${a.id}/members`, { method: "DELETE", ...jsonBody({ freelancerId: m.freelancerId }) }))}
                        className="text-slate-500 hover:text-rose-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <select
                    aria-label={`Add a freelancer to ${a.name}`}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    value={pick[a.id] ?? ""}
                    onChange={(e) => setPick({ ...pick, [a.id]: e.target.value })}
                  >
                    <option value="">Add a freelancer…</option>
                    {freelancers
                      .filter((f) => !taken.has(f.id))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.freelancer}
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={busy || !pick[a.id]}
                    onClick={() =>
                      void run(async () => {
                        await api(`/api/agencies/${a.id}/members`, { method: "POST", ...jsonBody({ freelancerId: pick[a.id] }) });
                        setPick({ ...pick, [a.id]: "" });
                      })
                    }
                    className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
