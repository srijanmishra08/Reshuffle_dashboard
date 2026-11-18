"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR } from "@/server/lib/money";
import {
  canTransitionDeal,
  dealStageLabels,
  dealStageValues,
  leadSourceValues,
  quotationStatusValues,
  temperatureValues,
  type DealStage,
  type DiagnosisBucket,
} from "@/server/models/deals";
import { bucketLabels, diagnosisLevels, diagnosisQuestions, engagementModels } from "@/lib/diagnosis-questions";

type DiagnosisEntry = { level: number; bucket: DiagnosisBucket; question: string; answer: string; painScore: number };
type Deal = {
  id: string;
  title: string;
  stage: DealStage;
  valuePaise: number;
  engagementModel: string | null;
  source: string | null;
  referrer: string | null;
  quotationStatus: (typeof quotationStatusValues)[number];
  currentBlock: string | null;
  temperature: (typeof temperatureValues)[number] | null;
  expectedClose: string | null;
  nextFollowUp: string | null;
  lostReason?: string | null;
  company: { id: string; name: string; lifecycle: string } | null;
  history: { id?: string; fromStage: string | null; toStage: string; at: string }[];
  diagnosis: { bucket: string; totalPain: number; answered: number }[];
  diagnosisEntries: DiagnosisEntry[];
};
type ScopeRow = {
  id: string;
  version: number;
  status: string;
  title: string;
  number: string | null;
  totalPaise: number;
  timelineDays: number;
};

const input = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";
const card = "rounded-2xl border border-slate-200 bg-white p-4";

const keyOf = (q: { level: number; question: string }) => `${q.level}:${q.question}`;

export function DealDetail({ id }: { id: string }) {
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"details" | "diagnosis" | "scopes">("details");
  const [form, setForm] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, { answer: string; painScore: number }>>({});

  const apply = useCallback((d: Deal) => {
    setDeal(d);
    setForm({
      title: d.title,
      rupees: String(d.valuePaise / 100),
      engagementModel: d.engagementModel ?? "",
      source: d.source ?? "",
      referrer: d.referrer ?? "",
      quotationStatus: d.quotationStatus,
      currentBlock: d.currentBlock ?? "",
      temperature: d.temperature ?? "",
      expectedClose: d.expectedClose ?? "",
      nextFollowUp: d.nextFollowUp ?? "",
    });
    const next: Record<string, { answer: string; painScore: number }> = {};
    for (const e of d.diagnosisEntries) next[keyOf(e)] = { answer: e.answer, painScore: e.painScore };
    setAnswers(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api<Deal>(`/api/deals/${id}`), api<ScopeRow[]>(`/api/deals/${id}/scopes`)]);
      apply(d);
      setScopes(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load deal");
    }
  }, [id, apply]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

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

  const save = () =>
    run(
      "save",
      async () => {
        const rupees = Number(form.rupees || 0);
        if (!Number.isFinite(rupees) || rupees < 0) throw new Error("Value must be a positive number");
        apply(
          await api<Deal>(`/api/deals/${id}`, {
            method: "PATCH",
            ...jsonBody({
              title: form.title,
              valuePaise: Math.round(rupees * 100),
              engagementModel: form.engagementModel,
              source: form.source,
              referrer: form.referrer,
              quotationStatus: form.quotationStatus,
              currentBlock: form.currentBlock,
              temperature: form.temperature || null,
              expectedClose: form.expectedClose || null,
              nextFollowUp: form.nextFollowUp || null,
            }),
          })
        );
      },
      "Saved"
    );

  const move = (to: DealStage) =>
    run("move", async () => {
      let lostReason: string | undefined;
      if (to === "LOST") {
        const reason = window.prompt("Why was this deal lost?");
        if (!reason) return;
        lostReason = reason;
      }
      await api(`/api/deals/${id}/transition`, { method: "POST", ...jsonBody({ to, lostReason }) });
      await load();
    });

  const saveDiagnosis = () =>
    run(
      "diagnosis",
      async () => {
        const entries = diagnosisQuestions
          .map((q) => ({ ...q, answer: answers[keyOf(q)]?.answer ?? "", painScore: answers[keyOf(q)]?.painScore ?? 0 }))
          .filter((e) => e.answer.trim() !== "" || e.painScore > 0);
        apply(await api<Deal>(`/api/deals/${id}/diagnosis`, { method: "PUT", ...jsonBody({ entries }) }));
      },
      "Diagnosis saved"
    );

  const newScope = () =>
    run("scope", async () => {
      if (!deal) return;
      const top = deal.diagnosisEntries
        .filter((e) => e.painScore >= 3 && e.answer.trim())
        .sort((a, b) => b.painScore - a.painScore)
        .slice(0, 6)
        .map((e) => `- ${e.question} ${e.answer}`)
        .join("\n");
      const scope = await api<{ id: string }>("/api/scopes", {
        method: "POST",
        ...jsonBody({
          dealId: id,
          title: deal.title,
          problemStatement: top,
          engagementModel: deal.engagementModel ?? "",
        }),
      });
      router.push(`/sales/${id}/scopes/${scope.id}`);
    });

  const convert = () =>
    run("convert", async () => {
      const project = await api<{ id: string }>(`/api/deals/${id}/convert`, { method: "POST" });
      router.push(`/projects/${project.id}`);
    });

  const painByBucket = useMemo(() => {
    const totals = new Map<DiagnosisBucket, number>();
    for (const q of diagnosisQuestions) {
      totals.set(q.bucket, (totals.get(q.bucket) ?? 0) + (answers[keyOf(q)]?.painScore ?? 0));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [answers]);

  if (!deal) return <p className="text-sm text-slate-500">{error || "Loading..."}</p>;

  const hasDraft = scopes.some((s) => s.status === "DRAFT");
  const hasAccepted = scopes.some((s) => s.status === "ACCEPTED");
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sales" className="text-xs text-slate-500 hover:underline">
            ← All deals
          </Link>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{deal.title}</h2>
          <p className="text-sm text-slate-500">
            {deal.company ? (
              <Link href={`/crm/${deal.company.id}`} className="hover:underline">
                {deal.company.name}
              </Link>
            ) : (
              "No company"
            )}{" "}
            · {formatINR(deal.valuePaise)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
            {dealStageLabels[deal.stage]}
          </span>
          <select
            aria-label="Move deal"
            value=""
            disabled={busy === "move"}
            onChange={(e) => e.target.value && move(e.target.value as DealStage)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Move to…</option>
            {dealStageValues
              .filter((s) => canTransitionDeal(deal.stage, s))
              .map((s) => (
                <option key={s} value={s}>
                  {dealStageLabels[s]}
                </option>
              ))}
          </select>
          {deal.stage === "WON" ? (
            <button
              onClick={convert}
              disabled={busy === "convert" || !hasAccepted}
              title={hasAccepted ? "" : "Needs an accepted scope first"}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Convert to project
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      <div className="flex gap-1 border-b border-slate-200">
        {(["details", "diagnosis", "scopes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-500"
            }`}
          >
            {t === "scopes" ? `Scopes (${scopes.length})` : t}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Title
                <input value={form.title ?? ""} onChange={set("title")} className={input} />
              </label>
              <label className={label}>
                Value (₹)
                <input type="number" min="0" value={form.rupees ?? ""} onChange={set("rupees")} className={input} />
              </label>
              <label className={label}>
                Engagement model
                <select value={form.engagementModel ?? ""} onChange={set("engagementModel")} className={input}>
                  <option value="">Not decided</option>
                  {engagementModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Temperature
                <select value={form.temperature ?? ""} onChange={set("temperature")} className={input}>
                  <option value="">—</option>
                  {temperatureValues.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Lead source
                <input list="lead-sources" value={form.source ?? ""} onChange={set("source")} className={input} />
                <datalist id="lead-sources">{leadSourceValues.map((v) => <option key={v} value={v} />)}</datalist>
              </label>
              <label className={label}>
                Referred by
                <input value={form.referrer ?? ""} onChange={set("referrer")} className={input} />
              </label>
              <label className={label}>
                Quotation status
                <select value={form.quotationStatus ?? "NONE"} onChange={set("quotationStatus")} className={input}>
                  {quotationStatusValues.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Current block
                <input value={form.currentBlock ?? ""} onChange={set("currentBlock")} className={input} />
              </label>
              <label className={label}>
                Next follow-up
                <input type="date" value={form.nextFollowUp ?? ""} onChange={set("nextFollowUp")} className={input} />
              </label>
              <label className={label}>
                Expected close
                <input type="date" value={form.expectedClose ?? ""} onChange={set("expectedClose")} className={input} />
              </label>
            </div>
            <button
              onClick={save}
              disabled={busy === "save"}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
          </section>

          <aside className="space-y-4">
            <section className={card}>
              <h3 className="text-sm font-semibold text-slate-800">Top pain buckets</h3>
              {deal.diagnosis.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No diagnosis yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {deal.diagnosis.map((d) => (
                    <li key={d.bucket} className="flex justify-between">
                      <span>{bucketLabels[d.bucket as DiagnosisBucket] ?? d.bucket}</span>
                      <span className="font-medium">{d.totalPain}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={card}>
              <h3 className="text-sm font-semibold text-slate-800">Stage history</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {deal.history.map((h, i) => (
                  <li key={h.id ?? i}>
                    {new Date(h.at).toLocaleDateString("en-IN")} · {h.fromStage ? `${h.fromStage} → ` : ""}
                    {h.toStage}
                  </li>
                ))}
              </ul>
              {deal.lostReason ? <p className="mt-2 text-xs text-rose-600">Lost: {deal.lostReason}</p> : null}
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "diagnosis" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {painByBucket.map(([bucket, total]) => (
              <span key={bucket} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                {bucketLabels[bucket]}: {total}
              </span>
            ))}
          </div>
          {diagnosisLevels.map((lvl) => (
            <section key={lvl.level} className={card}>
              <h3 className="text-sm font-semibold text-slate-800">
                Level {lvl.level}: {lvl.name}
              </h3>
              <div className="mt-3 space-y-3">
                {diagnosisQuestions
                  .filter((q) => q.level === lvl.level)
                  .map((q) => {
                    const k = keyOf(q);
                    const cur = answers[k] ?? { answer: "", painScore: 0 };
                    return (
                      <div key={k} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <label className={label}>
                          {q.question}
                          <textarea
                            rows={2}
                            value={cur.answer}
                            onChange={(e) => setAnswers((a) => ({ ...a, [k]: { ...cur, answer: e.target.value } }))}
                            className={input}
                          />
                        </label>
                        <label className={label}>
                          Pain 0-5
                          <select
                            value={cur.painScore}
                            onChange={(e) =>
                              setAnswers((a) => ({ ...a, [k]: { ...cur, painScore: Number(e.target.value) } }))
                            }
                            className={input}
                          >
                            {[0, 1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
          <button
            onClick={saveDiagnosis}
            disabled={busy === "diagnosis"}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save diagnosis
          </button>
        </div>
      ) : null}

      {tab === "scopes" ? (
        <div className="space-y-3">
          <button
            onClick={newScope}
            disabled={busy === "scope" || hasDraft}
            title={hasDraft ? "Finish or delete the current draft first" : ""}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            New scope
          </button>
          {scopes.length === 0 ? (
            <p className="text-sm text-slate-500">No scopes yet. A new scope is pre-filled from the diagnosis.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Version</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {scopes.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">v{s.version}</td>
                      <td className="px-3 py-2">
                        <Link href={`/sales/${id}/scopes/${s.id}`} className="font-medium text-slate-900 hover:underline">
                          {s.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{s.number ?? "—"}</td>
                      <td className="px-3 py-2">{s.status}</td>
                      <td className="px-3 py-2 text-right">{formatINR(s.totalPaise)}</td>
                      <td className="px-3 py-2 text-right">{s.timelineDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
