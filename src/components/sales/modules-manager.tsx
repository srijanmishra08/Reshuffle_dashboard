"use client";

import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";

type LibraryModule = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  defaultDeliverables: string | null;
  defaultDays: number;
  defaultPricePaise: number;
  active: boolean;
};

const empty = { name: "", category: "", defaultDeliverables: "", days: "", rupees: "" };
const input = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";

export function ModulesManager() {
  const [modules, setModules] = useState<LibraryModule[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setModules(await api<LibraryModule[]>("/api/modules"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load modules");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const body = {
      name: form.name,
      category: form.category || "General",
      defaultDeliverables: form.defaultDeliverables,
      defaultDays: Math.max(0, Math.round(Number(form.days || 0))),
      defaultPricePaise: Math.max(0, Math.round(Number(form.rupees || 0) * 100)),
    };
    try {
      if (editing) await api(`/api/modules/${editing}`, { method: "PATCH", ...jsonBody(body) });
      else await api("/api/modules", { method: "POST", ...jsonBody(body) });
      setForm(empty);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save module");
    }
  }

  async function toggle(m: LibraryModule) {
    setError("");
    try {
      await api(`/api/modules/${m.id}`, { method: "PATCH", ...jsonBody({ active: !m.active }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update module");
    }
  }

  function edit(m: LibraryModule) {
    setEditing(m.id);
    setForm({
      name: m.name,
      category: m.category,
      defaultDeliverables: m.defaultDeliverables ?? "",
      days: String(m.defaultDays),
      rupees: String(m.defaultPricePaise / 100),
    });
  }

  const set = (key: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="mt-3 space-y-4">
      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_6rem_9rem]">
          <label className={label}>
            Module name
            <input required value={form.name} onChange={set("name")} className={input} />
          </label>
          <label className={label}>
            Category
            <input value={form.category} onChange={set("category")} placeholder="Operations" className={input} />
          </label>
          <label className={label}>
            Days
            <input type="number" min="0" value={form.days} onChange={set("days")} className={input} />
          </label>
          <label className={label}>
            Price (₹)
            <input type="number" min="0" value={form.rupees} onChange={set("rupees")} className={input} />
          </label>
        </div>
        <label className={`${label} mt-3 block`}>
          Default deliverables
          <textarea rows={2} value={form.defaultDeliverables} onChange={set("defaultDeliverables")} className={input} />
        </label>
        <div className="mt-3 flex gap-2">
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            {editing ? "Save module" : "Add module"}
          </button>
          {editing ? (
            <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium">
              Cancel
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">Adding and editing modules needs an admin or manager role.</p>
      </form>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Module</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {modules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">No modules yet.</td>
              </tr>
            ) : null}
            {modules.map((m) => (
              <tr key={m.id} className={`border-t border-slate-100 ${m.active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{m.name}</p>
                  {m.defaultDeliverables ? <p className="text-xs text-slate-500">{m.defaultDeliverables}</p> : null}
                </td>
                <td className="px-3 py-2">{m.category}</td>
                <td className="px-3 py-2 text-right">{m.defaultDays}</td>
                <td className="px-3 py-2 text-right">{formatINR(m.defaultPricePaise)}</td>
                <td className="px-3 py-2 text-right text-xs">
                  <button onClick={() => edit(m)} className="mr-3 text-slate-700 underline">Edit</button>
                  <button onClick={() => toggle(m)} className="text-slate-700 underline">{m.active ? "Retire" : "Restore"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
