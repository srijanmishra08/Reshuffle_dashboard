"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatDate, localToIso, type Interaction, type Meeting } from "@/lib/crm-types";

const input = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900";
const label = "text-xs text-slate-500";
const card = "rounded-2xl border border-slate-200 bg-white p-4";
const touchTypes = ["CALL", "MEETING", "WHATSAPP", "EMAIL", "NOTE", "SITE_VISIT"] as const;

/**
 * Calls, messages and meetings about this lead: the history of its 1st and 2nd meetings and every follow-up.
 * Entries are stored on the client with this lead's id, so they also show on the client's page.
 */
export function DealActivity({ dealId, companyId }: { dealId: string; companyId: string }) {
  const base = `/api/companies/${companyId}`;
  const [touches, setTouches] = useState<Interaction[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [forms, setForms] = useState<{ id: string; title: string; status: string; responses: number }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [touch, setTouch] = useState({ type: "CALL" as (typeof touchTypes)[number], summary: "", nextAction: "", nextActionAt: "" });
  const [meet, setMeet] = useState({ title: "", at: "", location: "", notes: "" });

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        api<Interaction[]>(`${base}/interactions?dealId=${encodeURIComponent(dealId)}`),
        api<Meeting[]>(`${base}/meetings?dealId=${encodeURIComponent(dealId)}`),
      ]);
      setTouches(t);
      setMeetings(m);
      api<{ id: string; title: string; status: string; responses: number; dealId: string | null }[]>("/api/questionnaires")
        .then((all) => setForms(all.filter((f) => f.dealId === dealId)))
        .catch(() => setForms([]));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the history");
    }
  }, [base, dealId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy("");
    }
  }

  const logTouch = (event: FormEvent) => {
    event.preventDefault();
    void run("touch", async () => {
      await api(`${base}/interactions`, {
        method: "POST",
        ...jsonBody({
          dealId,
          type: touch.type,
          summary: touch.summary,
          nextAction: touch.nextAction || undefined,
          nextActionAt: touch.nextAction ? localToIso(touch.nextActionAt) : undefined,
        }),
      });
      setTouch({ type: "CALL", summary: "", nextAction: "", nextActionAt: "" });
    });
  };

  const addMeeting = (event: FormEvent) => {
    event.preventDefault();
    void run("meeting", async () => {
      await api(`${base}/meetings`, {
        method: "POST",
        ...jsonBody({ dealId, title: meet.title, at: localToIso(meet.at), location: meet.location || undefined, notes: meet.notes || undefined }),
      });
      setMeet({ title: "", at: "", location: "", notes: "" });
    });
  };

  const timeline = [
    ...touches.map((t) => ({ key: `t-${t.id}`, at: t.at, kind: t.type, text: t.summary, extra: t.nextAction ? `Next: ${t.nextAction} (${formatDate(t.nextActionAt)}${t.nextActionDoneAt ? ", done" : ""})` : "" })),
    ...meetings.map((m) => ({ key: `m-${m.id}`, at: m.at, kind: "MEETING", text: m.title, extra: [m.location, m.notes].filter(Boolean).join(" · ") })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className={`${card} lg:col-span-2`}>
        <h3 className="text-sm font-semibold text-slate-800">History</h3>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        {timeline.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing logged for this lead yet. Log the 1st meeting or a call on the right.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {timeline.map((entry) => (
              <li key={entry.key} className="border-l-2 border-slate-200 pl-3 text-sm">
                <p className="text-xs text-slate-500">{formatDate(entry.at)} · {entry.kind}</p>
                <p className="text-slate-900">{entry.text}</p>
                {entry.extra ? <p className="text-xs text-slate-500">{entry.extra}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="space-y-4">
        {forms.length > 0 ? (
          <section className={card}>
            <h3 className="text-sm font-semibold text-slate-800">Forms for this lead</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {forms.map((f) => (
                <li key={f.id}>
                  <Link href={`/questionnaires/${f.id}`} className="text-slate-900 hover:underline">{f.title}</Link>
                  <span className="text-xs text-slate-500"> · {f.status.toLowerCase()} · {Number(f.responses)} {Number(f.responses) === 1 ? "response" : "responses"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <form onSubmit={logTouch} className={`${card} space-y-2`}>
          <h3 className="text-sm font-semibold text-slate-800">Log a call or message</h3>
          <select value={touch.type} onChange={(e) => setTouch({ ...touch, type: e.target.value as typeof touch.type })} className={input}>
            {touchTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <textarea required value={touch.summary} onChange={(e) => setTouch({ ...touch, summary: e.target.value })} placeholder="What happened?" rows={2} className={input} />
          <label className={label}>
            Next action (optional)
            <input value={touch.nextAction} onChange={(e) => setTouch({ ...touch, nextAction: e.target.value })} className={input} />
          </label>
          {touch.nextAction ? (
            <label className={label}>
              When
              <input required type="datetime-local" value={touch.nextActionAt} onChange={(e) => setTouch({ ...touch, nextActionAt: e.target.value })} className={input} />
            </label>
          ) : null}
          <button disabled={busy === "touch"} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Log</button>
        </form>
        <form onSubmit={addMeeting} className={`${card} space-y-2`}>
          <h3 className="text-sm font-semibold text-slate-800">Add a meeting</h3>
          <input required value={meet.title} onChange={(e) => setMeet({ ...meet, title: e.target.value })} placeholder="1st meeting, 2nd meeting..." className={input} />
          <input required type="datetime-local" value={meet.at} onChange={(e) => setMeet({ ...meet, at: e.target.value })} className={input} />
          <input value={meet.location} onChange={(e) => setMeet({ ...meet, location: e.target.value })} placeholder="Place or link (optional)" className={input} />
          <textarea value={meet.notes} onChange={(e) => setMeet({ ...meet, notes: e.target.value })} placeholder="Notes (optional)" rows={2} className={input} />
          <button disabled={busy === "meeting"} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Add meeting</button>
        </form>
      </div>
    </div>
  );
}
