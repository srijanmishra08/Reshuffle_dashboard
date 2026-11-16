"use client";

import { useState } from "react";

type Question = { id: string; label: string; type: string; required: boolean; options: string[] };
type Answers = Record<string, string | string[]>;

const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

const htmlType: Record<string, string> = { email: "email", phone: "tel", number: "number", date: "date" };

export function PublicForm({ token, questions }: { token: string; questions: Question[] }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (id: string, value: string | string[]) => setAnswers((a) => ({ ...a, [id]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const missing = questions.find((q) => q.type === "checkbox" && q.required && !((answers[q.id] as string[] | undefined)?.length));
    if (missing) return setError(`Please answer: ${missing.label}`);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/p/form/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers, website }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Could not send your answers. Please try again.");
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your answers. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6" role="status">
        <h2 className="text-lg font-semibold text-emerald-900">Thank you. Your answers are in.</h2>
        <p className="mt-1 text-sm text-emerald-800">We will get back to you shortly. You can close this page.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      {questions.map((q) => {
        const mark = q.required ? <span className="text-rose-600"> *</span> : null;
        if (q.type === "multiple_choice" || q.type === "checkbox") {
          const picked = (answers[q.id] as string[] | undefined) ?? [];
          return (
            <fieldset key={q.id}>
              <legend className="text-sm font-medium">
                {q.label}
                {mark}
              </legend>
              <div className="mt-2 space-y-1.5">
                {q.options.map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    {q.type === "multiple_choice" ? (
                      <input type="radio" name={q.id} required={q.required} checked={answers[q.id] === o} onChange={() => set(q.id, o)} />
                    ) : (
                      <input
                        type="checkbox"
                        checked={picked.includes(o)}
                        onChange={(e) => set(q.id, e.target.checked ? [...picked, o] : picked.filter((v) => v !== o))}
                      />
                    )}
                    {o}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        const value = (answers[q.id] as string | undefined) ?? "";
        return (
          <label key={q.id} className="block text-sm font-medium">
            {q.label}
            {mark}
            {q.type === "long_text" ? (
              <textarea rows={4} maxLength={5000} required={q.required} className={input} value={value} onChange={(e) => set(q.id, e.target.value)} />
            ) : q.type === "dropdown" ? (
              <select required={q.required} className={input} value={value} onChange={(e) => set(q.id, e.target.value)}>
                <option value="">Choose…</option>
                {q.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={htmlType[q.type] ?? "text"}
                step={q.type === "number" ? "any" : undefined}
                maxLength={500}
                required={q.required}
                className={input}
                value={value}
                onChange={(e) => set(q.id, e.target.value)}
              />
            )}
          </label>
        );
      })}

      {/* Hidden from people; bots fill it and are ignored. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error ? <p className="text-sm text-rose-600" role="alert">{error}</p> : null}
      <button disabled={busy} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Sending…" : "Submit answers"}
      </button>
    </form>
  );
}
