"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import type { PersonRow } from "@/lib/billing-types";

const kinds = ["EMPLOYEE", "INTERN", "CONTRACTOR"] as const;

export function PeopleList() {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "", kind: "EMPLOYEE", joinedOn: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<PersonRow[]>("/api/people")
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load people"));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/people", {
        method: "POST",
        ...jsonBody({
          name: form.name,
          email: form.email || null,
          role: form.role,
          kind: form.kind,
          joinedOn: form.joinedOn || null,
        }),
      });
      setForm({ name: "", email: "", role: "", kind: "EMPLOYEE", joinedOn: "" });
      setAdding(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add person");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setAdding((v) => !v)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          {adding ? "Cancel" : "Add person"}
        </button>
      </div>
      {adding ? (
        <form onSubmit={add} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-5">
          <input className={input} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={input} placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={input} placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <select className={input} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className={input} type="date" value={form.joinedOn} onChange={(e) => setForm({ ...form, joinedOn: e.target.value })} />
          <button disabled={busy} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-5">
            Save
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2">PAN</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">
                  <Link className="underline" href={`/people/${p.id}`}>{p.name}</Link>
                </td>
                <td className="px-3 py-2">{p.role}</td>
                <td className="px-3 py-2">{p.kind}</td>
                <td className="px-3 py-2">{p.joinedOn ?? ""}</td>
                <td className="px-3 py-2 text-slate-500">{p.panMasked ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No people yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
