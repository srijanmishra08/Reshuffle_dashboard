"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import { engagementModels } from "@/lib/diagnosis-questions";

type Item = {
  key: string;
  phase: string;
  moduleId: string | null;
  title: string;
  description: string;
  days: string;
  rupees: string;
};
type Step = { label: string; percent: string };
type Scope = {
  id: string;
  dealId: string;
  version: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "SUPERSEDED";
  title: string;
  problemStatement: string;
  engagementModel: string | null;
  terms: string;
  totalPaise: number;
  timelineDays: number;
  number: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  paymentSchedule: { label: string; percent: number; amountPaise: number }[];
  items: {
    id: string;
    phase: string;
    moduleId: string | null;
    title: string;
    description: string | null;
    days: number;
    pricePaise: number;
  }[];
};
type LibraryModule = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  defaultDeliverables: string | null;
  defaultDays: number;
  defaultPricePaise: number;
};

const input = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50";
const label = "text-xs text-slate-500";
const card = "rounded-2xl border border-slate-200 bg-white p-4";

let seq = 0;
const nextKey = () => `item-${Date.now()}-${seq++}`;

const toPaise = (rupees: string) => {
  const n = Number(rupees || 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const toInt = (value: string) => {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

export function ScopeEditor({ dealId, scopeId }: { dealId: string; scopeId: string }) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope | null>(null);
  const [library, setLibrary] = useState<LibraryModule[]>([]);
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [model, setModel] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [sharePath, setSharePath] = useState("");
  const [mailTo, setMailTo] = useState("");
  const mailKey = useRef(crypto.randomUUID());
  const [sendKey] = useState(() => `send-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const apply = useCallback((s: Scope) => {
    setScope(s);
    setTitle(s.title);
    setProblem(s.problemStatement);
    setModel(s.engagementModel ?? "");
    setTerms(s.terms);
    setItems(
      s.items.map((i) => ({
        key: i.id,
        phase: i.phase,
        moduleId: i.moduleId,
        title: i.title,
        description: i.description ?? "",
        days: String(i.days),
        rupees: String(i.pricePaise / 100),
      }))
    );
    setSteps(s.paymentSchedule.map((p) => ({ label: p.label, percent: String(p.percent) })));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<Scope>(`/api/scopes/${scopeId}`)
        .then(apply)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load scope"));
      api<LibraryModule[]>("/api/modules?active=true")
        .then(setLibrary)
        .catch(() => setNotice("Module library could not be loaded. Custom items still work."));
    }, 0);
    return () => clearTimeout(timer);
  }, [scopeId, apply]);

  const editable = scope?.status === "DRAFT";
  const totalPaise = useMemo(() => items.reduce((s, i) => s + toPaise(i.rupees), 0), [items]);
  const totalDays = useMemo(() => items.reduce((s, i) => s + toInt(i.days), 0), [items]);
  const percentSum = steps.reduce((s, p) => s + toInt(p.percent), 0);
  const phases = useMemo(() => [...new Set(items.map((i) => i.phase || "Phase 1"))], [items]);

  function payload() {
    return {
      title,
      problemStatement: problem,
      engagementModel: model,
      terms,
      items: items.map((i) => ({
        phase: i.phase.trim() || "Phase 1",
        moduleId: i.moduleId,
        title: i.title,
        description: i.description,
        days: toInt(i.days),
        pricePaise: toPaise(i.rupees),
      })),
      paymentSchedule: steps.map((p) => ({ label: p.label, percent: toInt(p.percent) })),
    };
  }

  async function run(key: string, action: () => Promise<void>, done?: string) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      if (done) setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
    }
  }

  const saveDraft = async () => apply(await api<Scope>(`/api/scopes/${scopeId}`, { method: "PATCH", ...jsonBody(payload()) }));

  const save = () => run("save", saveDraft, "Draft saved");

  const send = () =>
    run(
      "send",
      async () => {
        if (!window.confirm("Send this scope? It gets a number and can no longer be edited.")) return;
        await saveDraft();
        apply(
          await api<Scope>(`/api/scopes/${scopeId}/send`, { method: "POST", ...jsonBody({ idempotencyKey: sendKey }) })
        );
      },
      "Scope sent. Create a share link for the client."
    );

  const share = () =>
    run("share", async () => {
      const res = await api<{ path: string }>(`/api/scopes/${scopeId}/share`, { method: "POST" });
      setSharePath(res.path);
      setShareUrl(`${window.location.origin}${res.path}`);
    });

  const emailLink = () =>
    run("email", async () => {
      const sent = await api<{ status: string; lastError: string | null }>("/api/mail/send", {
        method: "POST",
        ...jsonBody({ kind: "SCOPE_LINK", to: mailTo, scopeId, path: sharePath, idempotencyKey: mailKey.current }),
      });
      if (sent.status !== "SENT") throw new Error(`Not sent yet (${sent.lastError ?? "will retry"}). It stays in the outbox and is retried automatically.`);
      mailKey.current = crypto.randomUUID();
      setNotice(`Link emailed to ${mailTo}`);
    });

  const revise = () =>
    run("revise", async () => {
      const next = await api<{ id: string }>(`/api/scopes/${scopeId}/revise`, { method: "POST" });
      router.push(`/sales/${dealId}/scopes/${next.id}`);
    });

  const remove = () =>
    run("delete", async () => {
      if (!window.confirm("Delete this draft?")) return;
      await api(`/api/scopes/${scopeId}`, { method: "DELETE" });
      router.push(`/sales/${dealId}`);
    });

  function addModule(id: string) {
    const m = library.find((x) => x.id === id);
    if (!m) return;
    setItems((list) => [
      ...list,
      {
        key: nextKey(),
        phase: list[list.length - 1]?.phase ?? "Phase 1",
        moduleId: m.id,
        title: m.name,
        description: m.defaultDeliverables ?? m.description ?? "",
        days: String(m.defaultDays),
        rupees: String(m.defaultPricePaise / 100),
      },
    ]);
  }

  function addCustom() {
    setItems((list) => [
      ...list,
      { key: nextKey(), phase: list[list.length - 1]?.phase ?? "Phase 1", moduleId: null, title: "", description: "", days: "0", rupees: "0" },
    ]);
  }

  const patchItem = (key: string, change: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));

  function moveItem(index: number, delta: number) {
    setItems((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  if (!scope) return <p className="text-sm text-slate-500">{error || "Loading..."}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/sales/${dealId}`} className="text-xs text-slate-500 hover:underline">
            ← Back to deal
          </Link>
          <p className="mt-1 text-sm text-slate-600">
            Version {scope.version} · <span className="font-medium text-slate-900">{scope.status}</span>
            {scope.number ? ` · ${scope.number}` : ""}
            {scope.acceptedBy ? ` · accepted by ${scope.acceptedBy}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <>
              <button onClick={save} disabled={busy !== ""} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                Save draft
              </button>
              <button onClick={send} disabled={busy !== "" || percentSum !== 100 || totalPaise <= 0} className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                Send
              </button>
              <button onClick={remove} disabled={busy !== ""} className="rounded-xl border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 disabled:opacity-50">
                Delete
              </button>
            </>
          ) : null}
          {scope.status !== "DRAFT" ? (
            <a href={`/api/scopes/${scopeId}/pdf`} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium">
              Download PDF
            </a>
          ) : null}
          {scope.status === "SENT" ? (
            <>
              <button onClick={share} disabled={busy !== ""} className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                Create share link
              </button>
              <button onClick={revise} disabled={busy !== ""} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                Revise (new version)
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      {shareUrl ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-900">Client link (shown once, older links are now revoked):</p>
          <div className="mt-1 flex gap-2">
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} className="flex-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs" />
            <button onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setNotice("Link copied"))} className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white">
              Copy
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="email"
              value={mailTo}
              onChange={(e) => {
                setMailTo(e.target.value);
                mailKey.current = crypto.randomUUID();
              }}
              placeholder="Client email"
              className="flex-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs"
            />
            <button
              onClick={emailLink}
              disabled={busy !== "" || mailTo.trim() === ""}
              className="rounded-lg border border-emerald-700 px-3 py-1 text-xs font-medium text-emerald-800 disabled:opacity-50"
            >
              Email this link
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <section className={card}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Title
                <input disabled={!editable} value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
              </label>
              <label className={label}>
                Engagement model
                <select disabled={!editable} value={model} onChange={(e) => setModel(e.target.value)} className={input}>
                  <option value="">Not decided</option>
                  {engagementModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={`${label} mt-3 block`}>
              Problem statement
              <textarea disabled={!editable} rows={5} value={problem} onChange={(e) => setProblem(e.target.value)} className={input} />
            </label>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Scope items</h3>
              {editable ? (
                <div className="flex gap-2">
                  <select aria-label="Add module" value="" onChange={(e) => e.target.value && addModule(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    <option value="">Add from library…</option>
                    {library.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.category}: {m.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={addCustom} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium">
                    Custom item
                  </button>
                </div>
              ) : null}
            </div>
            {library.length === 0 && editable ? (
              <p className="mt-2 text-xs text-slate-500">
                The module library is empty. <Link href="/settings/modules" className="underline">Add modules</Link> to reuse them across scopes.
              </p>
            ) : null}
            <div className="mt-3 space-y-3">
              {items.length === 0 ? <p className="text-sm text-slate-500">No items yet.</p> : null}
              {items.map((item, index) => (
                <div key={item.key} className="rounded-xl border border-slate-200 p-3">
                  <div className="grid gap-2 sm:grid-cols-[8rem_1fr_5rem_8rem]">
                    <label className={label}>
                      Phase
                      <input disabled={!editable} value={item.phase} onChange={(e) => patchItem(item.key, { phase: e.target.value })} className={input} />
                    </label>
                    <label className={label}>
                      Item
                      <input disabled={!editable} value={item.title} onChange={(e) => patchItem(item.key, { title: e.target.value })} className={input} />
                    </label>
                    <label className={label}>
                      Days
                      <input disabled={!editable} type="number" min="0" value={item.days} onChange={(e) => patchItem(item.key, { days: e.target.value })} className={input} />
                    </label>
                    <label className={label}>
                      Price (₹)
                      <input disabled={!editable} type="number" min="0" value={item.rupees} onChange={(e) => patchItem(item.key, { rupees: e.target.value })} className={input} />
                    </label>
                  </div>
                  <label className={`${label} mt-2 block`}>
                    Deliverables
                    <textarea disabled={!editable} rows={2} value={item.description} onChange={(e) => patchItem(item.key, { description: e.target.value })} className={input} />
                  </label>
                  {editable ? (
                    <div className="mt-2 flex gap-3 text-xs">
                      <button onClick={() => moveItem(index, -1)} disabled={index === 0} className="text-slate-600 disabled:opacity-40">↑ Up</button>
                      <button onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} className="text-slate-600 disabled:opacity-40">↓ Down</button>
                      <button onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))} className="text-rose-600">Remove</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className={card}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Payment schedule</h3>
              <span className={`text-xs font-medium ${percentSum === 100 ? "text-emerald-700" : "text-rose-600"}`}>{percentSum}% of 100%</span>
            </div>
            <div className="mt-3 space-y-2">
              {steps.map((step, index) => (
                <div key={index} className="grid grid-cols-[1fr_5rem_auto] items-end gap-2">
                  <label className={label}>
                    Label
                    <input disabled={!editable} value={step.label} onChange={(e) => setSteps((s) => s.map((p, i) => (i === index ? { ...p, label: e.target.value } : p)))} className={input} />
                  </label>
                  <label className={label}>
                    %
                    <input disabled={!editable} type="number" min="1" max="100" value={step.percent} onChange={(e) => setSteps((s) => s.map((p, i) => (i === index ? { ...p, percent: e.target.value } : p)))} className={input} />
                  </label>
                  {editable ? (
                    <button onClick={() => setSteps((s) => s.filter((_, i) => i !== index))} className="pb-2 text-xs text-rose-600">Remove</button>
                  ) : <span />}
                </div>
              ))}
            </div>
            {editable ? (
              <button onClick={() => setSteps((s) => [...s, { label: "", percent: "" }])} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium">
                Add step
              </button>
            ) : null}
          </section>

          <section className={card}>
            <label className={label}>
              Terms
              <textarea disabled={!editable} rows={6} value={terms} onChange={(e) => setTerms(e.target.value)} className={input} />
            </label>
          </section>
        </div>

        <aside className="h-fit space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 xl:sticky xl:top-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Preview</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{title || "Untitled scope"}</h3>
            {model ? <p className="text-xs text-slate-500">{model}</p> : null}
          </div>
          {problem ? <p className="whitespace-pre-wrap text-sm text-slate-700">{problem}</p> : null}
          {phases.map((phase) => (
            <div key={phase}>
              <p className="text-xs font-semibold uppercase text-slate-500">{phase}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {items
                  .filter((i) => (i.phase || "Phase 1") === phase)
                  .map((i) => (
                    <li key={i.key} className="flex justify-between gap-3">
                      <span className="text-slate-800">{i.title || "Untitled item"}</span>
                      <span className="shrink-0 text-slate-600">{formatINR(toPaise(i.rupees))}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <div className="border-t border-slate-200 pt-3 text-sm">
            <p className="flex justify-between font-semibold text-slate-900">
              <span>Total (before GST)</span>
              <span>{formatINR(totalPaise)}</span>
            </p>
            <p className="mt-1 flex justify-between text-slate-600">
              <span>Timeline</span>
              <span>
                {totalDays} days (~{Math.ceil(totalDays / 7)} weeks)
              </span>
            </p>
          </div>
          <div className="text-sm">
            <p className="text-xs font-semibold uppercase text-slate-500">Payments</p>
            <ul className="mt-1 space-y-1">
              {steps.map((p, i) => (
                <li key={i} className="flex justify-between text-slate-700">
                  <span>
                    {p.label || "Step"} ({toInt(p.percent)}%)
                  </span>
                  <span>{formatINR(Math.floor((totalPaise * toInt(p.percent)) / 100))}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
