"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { useSalesNodes } from "@/lib/use-sales-nodes";
import { useStaff } from "@/lib/use-staff";
import { formatINR } from "@/server/lib/money";
import { salesNodeKindLabels, salesNodeKindValues } from "@/server/models/deals";

type ModuleOption = { id: string; name: string; category: string; defaultPricePaise: number };
type Added = { id: string; name: string };

const box = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";
const empty = { name: "", contactName: "", contactEmail: "", contactPhone: "", node: "", newNodeName: "", newNodeKind: "INDIVIDUAL", title: "", rupees: "" };

/**
 * Where a new lead is recorded: who they are, how to reach them, who found them and what they need. Tracking the lead
 * from here on happens on Outreach, so this page is only the form.
 */
export function LeadForm() {
  const [form, setForm] = useState(empty);
  const [added, setAdded] = useState<Added | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { staff, currentUserId } = useStaff();
  const { nodes, reload: reloadNodes } = useSalesNodes();
  const [ownerPick, setOwnerPick] = useState("");
  const ownerShown = ownerPick || currentUserId;
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [valueTouched, setValueTouched] = useState(false);
  // Modules are SKUs: until the value is typed by hand it is the sum of the chosen modules' prices.
  const modulesPaise = modules.filter((m) => moduleIds.includes(m.id)).reduce((sum, m) => sum + m.defaultPricePaise, 0);
  const rupeesShown = valueTouched ? form.rupees : modulesPaise > 0 ? String(modulesPaise / 100) : "";

  useEffect(() => {
    const timer = setTimeout(() => {
      api<ModuleOption[]>("/api/modules?active=true").then(setModules).catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setAdded(null);
    const name = form.name.trim();
    setSaving(true);
    try {
      let salesNodeId = form.node || undefined;
      if (form.node === "__new") {
        const made = await api<{ id: string }>("/api/sales-nodes", {
          method: "POST",
          ...jsonBody({ name: form.newNodeName.trim(), kind: form.newNodeKind }),
        });
        salesNodeId = made.id;
        await reloadNodes();
      }
      const deal = await api<{ id: string }>("/api/deals", {
        method: "POST",
        ...jsonBody({
          companyName: name,
          contactName: form.contactName.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
          title: form.title.trim() || name,
          salesNodeId,
          ownerId: ownerShown || undefined,
          moduleIds,
          valuePaise: Math.round(Number(rupeesShown || 0) * 100),
        }),
      });
      setAdded({ id: deal.id, name });
      setForm(empty);
      setModuleIds([]);
      setValueTouched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Record a new lead here. It then appears on <Link href="/outreach" className="underline">Outreach</Link>, where you follow it up, email it and move it
        through the stages, and under <Link href="/crm" className="underline">Clients</Link> as a prospect.
      </p>
      {added ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          Recorded <strong>{added.name}</strong>.{" "}
          <Link href={`/sales/${added.id}`} className="underline">Open the lead</Link> · <Link href="/outreach" className="underline">See it on Outreach</Link>
        </div>
      ) : null}
      <form onSubmit={create} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <fieldset>
          <legend className="text-sm font-semibold text-slate-800">Who is the lead</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>
              Lead / client name
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company or person" className={box} />
            </label>
            <label className={label}>
              Contact person
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={box} />
            </label>
            <label className={label}>
              Contact email
              <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="Used by the Email button" className={box} />
            </label>
            <label className={label}>
              Contact phone
              <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={box} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-800">How we found them</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>
              Found through (sales node)
              <select value={form.node} onChange={(e) => setForm({ ...form, node: e.target.value })} className={box}>
                <option value="">Direct / no sales node</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name} ({n.kindLabel})</option>
                ))}
                <option value="__new">+ New sales node…</option>
              </select>
            </label>
            {form.node === "__new" ? (
              <>
                <label className={label}>
                  Node name
                  <input required value={form.newNodeName} onChange={(e) => setForm({ ...form, newNodeName: e.target.value })} className={box} />
                </label>
                <label className={label}>
                  Kind
                  <select value={form.newNodeKind} onChange={(e) => setForm({ ...form, newNodeKind: e.target.value })} className={box}>
                    {salesNodeKindValues.map((k) => (
                      <option key={k} value={k}>{salesNodeKindLabels[k]}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <label className={label}>
              Owner
              <select value={ownerShown} onChange={(e) => setOwnerPick(e.target.value)} className={box}>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? " (me)" : ""}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-800">What they need</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>
              Deal title (optional)
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Defaults to the name" className={box} />
            </label>
            <label className={label}>
              Expected value (₹)
              <input type="number" min="0" value={rupeesShown} onChange={(e) => { setValueTouched(true); setForm({ ...form, rupees: e.target.value }); }} className={box} />
            </label>
          </div>
          {modules.length > 0 ? (
            <div className="mt-3 text-xs text-slate-500">
              <p className="mb-1">Modules (SKUs) the client needs: the value fills in from their prices</p>
              <div className="flex flex-wrap gap-1.5">
                {modules.map((m) => {
                  const on = moduleIds.includes(m.id);
                  return (
                    <label key={m.id} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => setModuleIds(on ? moduleIds.filter((id) => id !== m.id) : [...moduleIds, m.id])} />
                      {m.name}{m.defaultPricePaise > 0 ? ` · ${formatINR(m.defaultPricePaise)}` : ""}
                    </label>
                  );
                })}
              </div>
              <Link href="/settings/modules" className="mt-2 inline-block underline">Manage module library</Link>
            </div>
          ) : null}
        </fieldset>

        {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}
        <button disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Recording…" : "Record lead"}</button>
      </form>
    </div>
  );
}
