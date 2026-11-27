"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import { salesNodeKindLabels, salesNodeKindValues, type SalesNodeKind } from "@/server/models/deals";
import { useStaff } from "@/lib/use-staff";
import { CommissionPanel } from "@/components/sales/commission-panel";

type Node = {
  id: string;
  name: string;
  kind: SalesNodeKind;
  kindLabel: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  userId: string | null;
  freelancerId: string | null;
  agencyId: string | null;
  active: boolean;
  leads: number;
  open: number;
  accepted: number;
  lost: number;
  commissionPercent?: number;
  acceptedPaise?: number;
  commissionDuePaise?: number;
  commissionPaidPaise?: number;
  commissionOwedPaise?: number;
};
type Linkable = { id: string; name: string };

const input = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";
const empty = { name: "", kind: "INDIVIDUAL" as SalesNodeKind, phone: "", email: "", commission: "", notes: "", linkId: "" };

/**
 * The people and companies that bring us leads. Each lead is credited to one, so this page shows how many leads
 * each brought and, for managers, the referral commission owed on the deals that were accepted.
 */
export function SalesNodesManager({ isAdmin = false }: { isAdmin?: boolean }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [freelancers, setFreelancers] = useState<Linkable[]>([]);
  const [agencies, setAgencies] = useState<Linkable[]>([]);
  const { staff } = useStaff();
  const showMoney = nodes.some((n) => n.commissionPercent !== undefined);

  const load = useCallback(async () => {
    try {
      setNodes(await api<Node[]>("/api/sales-nodes"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sales nodes");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      api<{ id: string; freelancer: string }[]>("/api/freelancers").then((r) => setFreelancers(r.map((f) => ({ id: f.id, name: f.freelancer })))).catch(() => undefined);
      api<{ id: string; name: string }[]>("/api/agencies").then((r) => setAgencies(r.map((a) => ({ id: a.id, name: a.name })))).catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const linkOptions: Linkable[] = form.kind === "FREELANCER" ? freelancers : form.kind === "AGENCY" ? agencies : form.kind === "SALES_STAFF" ? staff.map((m) => ({ id: m.id, name: m.name })) : [];

  function startEdit(n: Node) {
    setEditing(n.id);
    setForm({
      name: n.name,
      kind: n.kind,
      phone: n.phone ?? "",
      email: n.email ?? "",
      commission: n.commissionPercent !== undefined ? String(n.commissionPercent) : "",
      notes: n.notes ?? "",
      linkId: n.freelancerId ?? n.agencyId ?? n.userId ?? "",
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const link = form.kind === "FREELANCER" ? { freelancerId: form.linkId || null } : form.kind === "AGENCY" ? { agencyId: form.linkId || null } : form.kind === "SALES_STAFF" ? { userId: form.linkId || null } : {};
    const body = {
      name: form.name,
      kind: form.kind,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
      ...link,
      ...(showMoney && form.commission !== "" ? { commissionPercent: Number(form.commission) } : {}),
    };
    try {
      if (editing) await api(`/api/sales-nodes/${editing}`, { method: "PATCH", ...jsonBody(body) });
      else await api("/api/sales-nodes", { method: "POST", ...jsonBody(body) });
      setEditing(null);
      setForm(empty);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function toggle(n: Node) {
    setError("");
    try {
      await api(`/api/sales-nodes/${n.id}`, { method: "PATCH", ...jsonBody({ active: !n.active }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/sales" className="text-xs text-slate-500 hover:underline">← Sales</Link>
      <form onSubmit={save} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <label className={label}>
          Name
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
        </label>
        <label className={label}>
          Kind
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SalesNodeKind, linkId: "" })} className={input}>
            {salesNodeKindValues.map((k) => (
              <option key={k} value={k}>{salesNodeKindLabels[k]}</option>
            ))}
          </select>
        </label>
        {linkOptions.length > 0 ? (
          <label className={label}>
            Linked {form.kind === "SALES_STAFF" ? "team member" : form.kind.toLowerCase()} (optional)
            <select
              value={form.linkId}
              onChange={(e) => {
                const picked = linkOptions.find((o) => o.id === e.target.value);
                setForm({ ...form, linkId: e.target.value, name: form.name || picked?.name || "" });
              }}
              className={input}
            >
              <option value="">Not linked</option>
              {linkOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={label}>
          Phone
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
        </label>
        <label className={label}>
          Email
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        </label>
        {showMoney ? (
          <label className={label}>
            Referral commission (% of accepted deal)
            <input type="number" min="0" max="100" step="0.01" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} className={input} />
          </label>
        ) : null}
        <label className={`${label} sm:col-span-3`}>
          Notes
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} />
        </label>
        <div className="flex gap-2 sm:col-span-3">
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">{editing ? "Save changes" : "Add sales node"}</button>
          {editing ? (
            <button type="button" onClick={() => { setEditing(null); setForm(empty); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700">Cancel</button>
          ) : null}
        </div>
      </form>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {(() => {
        const n = showMoney && paying ? nodes.find((x) => x.id === paying) : undefined;
        return n ? (
          <CommissionPanel
            key={n.id}
            nodeId={n.id}
            nodeName={n.name}
            commissionPercent={n.commissionPercent ?? 0}
            owedPaise={n.commissionOwedPaise ?? 0}
            isAdmin={isAdmin}
            onChanged={() => void load()}
            onClose={() => setPaying(null)}
          />
        ) : null;
      })()}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Open</th>
              <th className="px-3 py-2 text-right">Accepted</th>
              <th className="px-3 py-2 text-right">Lost</th>
              {showMoney ? <th className="px-3 py-2 text-right">Accepted value</th> : null}
              {showMoney ? <th className="px-3 py-2 text-right">Commission</th> : null}
              {showMoney ? <th className="px-3 py-2 text-right">Paid</th> : null}
              {showMoney ? <th className="px-3 py-2 text-right">Owed</th> : null}
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {nodes.length === 0 ? (
              <tr><td colSpan={showMoney ? 11 : 7} className="px-3 py-6 text-center text-slate-500">No sales nodes yet. Add one above, or pick &quot;New sales node&quot; when adding a lead.</td></tr>
            ) : null}
            {nodes.map((n) => (
              <tr key={n.id} className={`border-b border-slate-100 last:border-0 ${n.active ? "" : "text-slate-400"}`}>
                <td className="px-3 py-2 font-medium">{n.name}{n.active ? "" : " (off)"}</td>
                <td className="px-3 py-2">{n.kindLabel}</td>
                <td className="px-3 py-2 text-right">{n.leads}</td>
                <td className="px-3 py-2 text-right">{n.open}</td>
                <td className="px-3 py-2 text-right">{n.accepted}</td>
                <td className="px-3 py-2 text-right">{n.lost}</td>
                {showMoney ? <td className="px-3 py-2 text-right">{formatINR(n.acceptedPaise ?? 0)}</td> : null}
                {showMoney ? (
                  <td className="px-3 py-2 text-right">
                    {n.commissionPercent ? `${n.commissionPercent}% · ${formatINR(n.commissionDuePaise ?? 0)}` : "—"}
                  </td>
                ) : null}
                {showMoney ? <td className="px-3 py-2 text-right">{n.commissionPaidPaise ? formatINR(n.commissionPaidPaise) : "—"}</td> : null}
                {showMoney ? (
                  <td className={`px-3 py-2 text-right ${(n.commissionOwedPaise ?? 0) > 0 ? "font-medium text-amber-700" : ""}`}>
                    {(n.commissionOwedPaise ?? 0) === 0 ? "—" : (n.commissionOwedPaise ?? 0) > 0 ? formatINR(n.commissionOwedPaise ?? 0) : `${formatINR(-(n.commissionOwedPaise ?? 0))} ahead`}
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button type="button" onClick={() => startEdit(n)} className="text-xs font-medium text-slate-700 hover:underline">Edit</button>
                  {showMoney ? (
                    <button type="button" onClick={() => setPaying(paying === n.id ? null : n.id)} className="ml-3 text-xs font-medium text-slate-700 hover:underline">Payments</button>
                  ) : null}
                  <button type="button" onClick={() => void toggle(n)} className="ml-3 text-xs font-medium text-slate-700 hover:underline">{n.active ? "Switch off" : "Switch on"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
