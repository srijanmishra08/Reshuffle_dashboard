"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import type { Company } from "@/lib/crm-types";
import { type QuestionTypeName, choiceTypes, questionTypeLabels, questionTypes } from "@/lib/schemas/questionnaires";

type Question = { id: string; label: string; type: QuestionTypeName; required: boolean; options: string[] };
type Response = { id: string; questions: Question[]; answers: Record<string, string | string[]>; submittedAt: string };
type Detail = {
  id: string;
  title: string;
  description: string;
  companyId: string | null;
  status: "OPEN" | "CLOSED";
  questions: Question[];
  path: string;
  responses: Response[];
};

const input = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";
const card = "rounded-2xl border border-slate-200 bg-white p-4";

const showAnswer = (value: string | string[] | undefined) => (Array.isArray(value) ? value.join(", ") : value) || "—";

export function QuestionnaireDetail({ id }: { id: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Detail | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (keepEdits: boolean) => {
      const data = await api<Detail>(`/api/questionnaires/${id}`);
      setForm(data);
      if (!keepEdits) {
        setTitle(data.title);
        setDescription(data.description);
        setCompanyId(data.companyId ?? "");
        setQuestions(data.questions);
        setDirty(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      load(false).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load the questionnaire"));
      api<Company[]>("/api/companies").then(setCompanies).catch(() => setMessage("Could not load clients"));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function edit(index: number, patch: Partial<Question>) {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
    setDirty(true);
  }

  function move(index: number, by: number) {
    const target = index + by;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
    setDirty(true);
  }

  const save = () =>
    run(async () => {
      const cleaned = questions.map((q) => ({
        ...q,
        options: choiceTypes.includes(q.type) ? q.options.map((o) => o.trim()).filter(Boolean) : [],
      }));
      await api(`/api/questionnaires/${id}`, { method: "PATCH", ...jsonBody({ title, description, companyId, questions: cleaned }) });
      await load(false);
      setMessage("Saved");
    });

  const setStatus = (status: "OPEN" | "CLOSED") =>
    run(async () => {
      await api(`/api/questionnaires/${id}`, { method: "PATCH", ...jsonBody({ status }) });
      await load(true);
    });

  const remove = () =>
    run(async () => {
      if (!form) return;
      const n = form.responses.length;
      if (!window.confirm(`Delete this questionnaire${n ? ` and its ${n} response(s)` : ""}? This cannot be undone.`)) return;
      await api(`/api/questionnaires/${id}`, { method: "DELETE" });
      router.push("/questionnaires");
    });

  if (!form) return <p className="text-sm text-slate-500">{message || "Loading..."}</p>;
  const link = typeof window === "undefined" ? form.path : `${window.location.origin}${form.path}`;

  return (
    <div className="space-y-5">
      <Link href="/questionnaires" className="text-xs text-slate-500 hover:underline">
        ← All questionnaires
      </Link>

      {message ? <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800">{message}</p> : null}

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Share link · {form.status === "OPEN" ? "accepting answers" : "closed"}</h3>
          <div className="flex gap-3 text-sm">
            <button disabled={busy} onClick={() => setStatus(form.status === "OPEN" ? "CLOSED" : "OPEN")} className="text-slate-700 underline">
              {form.status === "OPEN" ? "Close form" : "Reopen form"}
            </button>
            <button disabled={busy} onClick={remove} className="text-rose-700 underline">
              Delete
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input readOnly value={link} aria-label="Share link" className={`${input} min-w-64 flex-1`} onFocus={(e) => e.target.select()} />
          <button
            onClick={() => navigator.clipboard.writeText(link).then(() => setMessage("Link copied"), () => setMessage("Could not copy. Select the link and copy it."))}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
          >
            Copy
          </button>
          <a href={form.path} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm">
            Open
          </a>
        </div>
        <p className="text-xs text-slate-500">Anyone with this link can fill in the form. No sign-in needed.</p>
      </section>

      <section className={`${card} space-y-3`}>
        <h3 className="text-sm font-semibold text-slate-800">Form</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={label}>
            Title
            <input className={`${input} mt-1`} value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
          </label>
          <label className={label}>
            Client (optional)
            <select className={`${input} mt-1`} value={companyId} onChange={(e) => { setCompanyId(e.target.value); setDirty(true); }}>
              <option value="">No client</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} md:col-span-2`}>
            Intro shown above the questions
            <textarea rows={2} className={`${input} mt-1`} value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} />
          </label>
        </div>

        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_14rem]">
                <input className={input} aria-label={`Question ${i + 1}`} value={q.label} onChange={(e) => edit(i, { label: e.target.value })} />
                <select className={input} aria-label={`Question ${i + 1} type`} value={q.type} onChange={(e) => edit(i, { type: e.target.value as QuestionTypeName })}>
                  {questionTypes.map((t) => (
                    <option key={t} value={t}>
                      {questionTypeLabels[t]}
                    </option>
                  ))}
                </select>
              </div>
              {choiceTypes.includes(q.type) ? (
                <label className={label}>
                  Options, one per line (at least two)
                  <textarea rows={3} className={`${input} mt-1`} value={q.options.join("\n")} onChange={(e) => edit(i, { options: e.target.value.split("\n") })} />
                </label>
              ) : null}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={q.required} onChange={(e) => edit(i, { required: e.target.checked })} />
                  Required
                </label>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="underline disabled:opacity-40">
                  Move up
                </button>
                <button type="button" disabled={i === questions.length - 1} onClick={() => move(i, 1)} className="underline disabled:opacity-40">
                  Move down
                </button>
                <button type="button" onClick={() => { setQuestions(questions.filter((_, j) => j !== i)); setDirty(true); }} className="text-rose-700 underline">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setQuestions([...questions, { id: `q${crypto.randomUUID().slice(0, 8)}`, label: "", type: "short_text", required: false, options: [] }]);
              setDirty(true);
            }}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
          >
            Add question
          </button>
          <button disabled={busy || !dirty} onClick={save} className="rounded-xl bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            Save changes
          </button>
          {dirty ? <span className="self-center text-xs text-amber-700">Unsaved changes. The shared form shows the last saved version.</span> : null}
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Responses ({form.responses.length})</h3>
          <button disabled={busy} onClick={() => run(() => load(true))} className="text-sm text-slate-700 underline">
            Refresh
          </button>
        </div>
        {form.responses.length === 0 ? <p className="text-sm text-slate-500">No answers yet. Send the link to your client.</p> : null}
        {form.responses.map((r) => (
          <details key={r.id} className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-900">
              {showAnswer(r.answers[r.questions[0]?.id])} · {new Date(r.submittedAt).toLocaleString("en-IN")}
            </summary>
            <dl className="mt-3 space-y-2 text-sm">
              {r.questions.map((q) => (
                <div key={q.id}>
                  <dt className="text-xs text-slate-500">{q.label}</dt>
                  <dd className="whitespace-pre-wrap text-slate-900">{showAnswer(r.answers[q.id])}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </section>
    </div>
  );
}
