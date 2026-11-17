"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";

type Doc = {
  id: string;
  docType: "INVOICE" | "WORK_ORDER";
  number: string;
  partyName: string;
  amountPaise: number | null;
  documentDate: string | null;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  invoiceId: string | null;
  companyId: string | null;
};
type Key = { id: string; label: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

const card = "rounded-2xl border border-slate-200 bg-white p-4";
const th = "px-3 py-2";
const input = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const typeLabel = { INVOICE: "Invoice", WORK_ORDER: "Work order" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const size = (bytes: number) => (bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

/** The PDFs the invoice software has sent here, and (for admins) the keys that let it do so. */
export function InvoicePdfLibrary({ isAdmin }: { isAdmin: boolean }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [keys, setKeys] = useState<Key[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [label, setLabel] = useState("Invoice software");
  const [fresh, setFresh] = useState<{ label: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDocs = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (type) params.set("docType", type);
    try {
      setDocs(await api<Doc[]>(`/api/uploaded-documents?${params}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the PDFs");
    }
  }, [q, type]);

  const loadKeys = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setKeys(await api<Key[]>("/api/ingest-keys"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the keys");
    }
  }, [isAdmin]);

  useEffect(() => {
    const timer = setTimeout(() => void loadDocs(), 250);
    return () => clearTimeout(timer);
  }, [loadDocs]);
  useEffect(() => {
    const timer = setTimeout(() => void loadKeys(), 0);
    return () => clearTimeout(timer);
  }, [loadKeys]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Saved from the invoice software</h3>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Search" placeholder="Search number or client" className={`${input} w-56`} value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Type" className={input} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              <option value="INVOICE">Invoices</option>
              <option value="WORK_ORDER">Work orders</option>
            </select>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className={th}>Type</th>
                <th className={th}>Number</th>
                <th className={th}>Client</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>Date on document</th>
                <th className={th}>Saved</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {docs === null && !error ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-slate-500">Loading...</td>
                </tr>
              ) : null}
              {docs?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-slate-500">
                    {q || type ? "Nothing matches." : "No PDFs yet. Once the invoice software is connected (below), every invoice or work order PDF you make there appears here."}
                  </td>
                </tr>
              ) : null}
              {docs?.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className={th}>{typeLabel[d.docType]}</td>
                  <td className={`${th} font-medium text-slate-900`}>
                    {d.invoiceId ? (
                      <Link href={`/invoices/${d.invoiceId}`} className="underline" title="Open the matching dashboard invoice">{d.number}</Link>
                    ) : (
                      d.number || "—"
                    )}
                  </td>
                  <td className={th}>
                    {d.companyId ? <Link href={`/crm/${d.companyId}`} className="hover:underline">{d.partyName}</Link> : d.partyName || "—"}
                  </td>
                  <td className={`${th} text-right`}>{d.amountPaise === null ? "—" : formatINR(d.amountPaise)}</td>
                  <td className={th}>{d.documentDate ?? "—"}</td>
                  <td className={th}>
                    {when(d.createdAt)} <span className="text-xs text-slate-400">· {size(d.sizeBytes)}</span>
                  </td>
                  <td className={`${th} space-x-3 text-right`}>
                    <a href={`/api/uploaded-documents/${d.id}/file`} target="_blank" rel="noreferrer" className="font-medium text-sky-700 hover:underline">Open PDF</a>
                    {isAdmin ? (
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Delete ${d.number || d.filename}? The saved PDF is removed and cannot be brought back. The copy you downloaded is not affected.`)) return;
                          void run(async () => {
                            await api(`/api/uploaded-documents/${d.id}`, { method: "DELETE" });
                            await loadDocs();
                          });
                        }}
                        className="text-xs text-rose-700 underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          A PDF whose invoice number matches an invoice in the dashboard is also attached to it as the original PDF. The same file is only saved once.
        </p>
      </section>

      {isAdmin ? (
        <section className={card}>
          <h3 className="text-sm font-semibold text-slate-800">Connect the invoice software</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Make a key below. It is shown once, so copy it straight away.</li>
            <li>Open the invoice software and click <strong>Dashboard: not connected</strong> in the corner.</li>
            <li>Paste the key. From then on, every invoice and work order PDF you make is also saved here.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">A key can only upload PDFs. It cannot read anything from the dashboard, and you can revoke it at any time. Salary slips, offer letters and letterheads are never uploaded.</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const made = await api<{ label: string; token: string }>("/api/ingest-keys", { method: "POST", ...jsonBody({ label }) });
                setFresh({ label: made.label, token: made.token });
                setCopied(false);
                await loadKeys();
              });
            }}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <label className="text-xs text-slate-500">
              Name for this key
              <input required className={`${input} mt-1 block w-56`} value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Make a key
            </button>
          </form>

          {fresh ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-medium text-emerald-900">Key for “{fresh.label}”. Copy it now: it is not shown again.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input readOnly aria-label="New key" value={fresh.token} onFocus={(e) => e.target.select()} className={`${input} min-w-64 flex-1 font-mono text-xs`} />
                <button
                  onClick={() => navigator.clipboard.writeText(fresh.token).then(() => setCopied(true), () => setError("Could not copy. Select the key and copy it."))}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : null}

          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {keys.length === 0 ? <li className="py-2 text-slate-500">No keys yet.</li> : null}
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium text-slate-900">{k.label}</span> <span className="font-mono text-xs text-slate-500">{k.prefix}…</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {k.revokedAt ? "revoked" : k.lastUsedAt ? `last used ${when(k.lastUsedAt)}` : "never used"}
                  </span>
                </span>
                {k.revokedAt ? null : (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Revoke the key “${k.label}”? The invoice software stops saving PDFs here until you connect it with a new key.`)) return;
                      void run(async () => {
                        await api(`/api/ingest-keys/${k.id}`, { method: "DELETE" });
                        await loadKeys();
                      });
                    }}
                    className="text-xs text-rose-700 underline disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
          {activeKeys.length === 0 && keys.length > 0 ? <p className="mt-2 text-xs text-amber-700">All keys are revoked, so the invoice software cannot save PDFs here.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
