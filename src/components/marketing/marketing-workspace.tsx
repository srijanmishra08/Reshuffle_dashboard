"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const STATUSES = ["IDEA", "DRAFT", "SCHEDULED", "POSTED"] as const;
type Status = (typeof STATUSES)[number];
const PLATFORMS = ["Instagram", "LinkedIn", "YouTube", "X", "Facebook", "WhatsApp", "Other"] as const;
type Platform = (typeof PLATFORMS)[number];
const LABEL: Record<Status, string> = { IDEA: "Idea", DRAFT: "Draft", SCHEDULED: "Scheduled", POSTED: "Posted" };

type Item = { id: string; title: string; platform: Platform; status: Status; publishDate: string; accountId: string | null };
type Account = { id: string; platform: Platform; handle: string; url: string | null };
type Vertical = { id: string; name: string };

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const field = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

export function MarketingWorkspace() {
  const [tab, setTab] = useState<"calendar" | "board" | "accounts">("calendar");
  const [month, setMonth] = useState(currentMonth);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [error, setError] = useState("");
  const request = useRef(0);

  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [publishDate, setPublishDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [handle, setHandle] = useState("");
  const [accPlatform, setAccPlatform] = useState<Platform>("Instagram");
  const [verticalId, setVerticalId] = useState("");

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const [content, accs] = await Promise.all([
        api<Item[]>(`/api/marketing/content?month=${encodeURIComponent(month)}`),
        api<Account[]>("/api/marketing/accounts"),
      ]);
      if (mine === request.current) {
        setItems(content);
        setAccounts(accs);
      }
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : "Could not load marketing data");
    }
  }, [month]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<Vertical[]>("/api/verticals").then(setVerticals).catch(() => setVerticals([]));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function run(action: () => Promise<unknown>, failure: string) {
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : failure);
    }
  }

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/marketing/content", { method: "POST", ...jsonBody({ title, platform, publishDate }) });
      setTitle("");
    }, "Could not add content");
  };
  const setStatus = (id: string, status: Status) =>
    run(() => api(`/api/marketing/content/${id}`, { method: "PATCH", ...jsonBody({ status }) }), "Could not update content");
  const removeItem = (id: string) => {
    if (!window.confirm("Delete this content item?")) return;
    void run(() => api(`/api/marketing/content/${id}`, { method: "DELETE" }), "Could not delete content");
  };
  const addAccount = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/marketing/accounts", {
        method: "POST",
        ...jsonBody({ platform: accPlatform, handle, verticalId: verticalId || null }),
      });
      setHandle("");
    }, "Could not add account");
  };
  const removeAccount = (id: string) => {
    if (!window.confirm("Delete this account? Posts keep their platform but lose the link.")) return;
    void run(() => api(`/api/marketing/accounts/${id}`, { method: "DELETE" }), "Could not delete account");
  };

  const days = [...new Set(items.map((i) => i.publishDate))].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {(["calendar", "board", "accounts"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1 capitalize ${tab === t ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab !== "accounts" ? (
          <label className="text-sm">
            <span className="block text-xs text-slate-500">Month</span>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={field} />
          </label>
        ) : null}
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {tab !== "accounts" ? (
        <form onSubmit={addItem} className="flex flex-wrap items-end gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New post idea" required className={`min-w-[200px] flex-1 ${field}`} />
          <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className={field}>
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} required className={field} />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
        </form>
      ) : null}

      {tab === "calendar" ? (
        <div className="space-y-3">
          {days.length === 0 ? <p className="text-sm text-slate-500">Nothing planned this month.</p> : null}
          {days.map((day) => (
            <section key={day} className="rounded-xl border border-slate-200 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold">{day}</h3>
              <ul className="space-y-1">
                {items.filter((i) => i.publishDate === day).map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{i.platform}</span>
                    <span className="flex-1">{i.title}</span>
                    <StatusSelect value={i.status} onChange={(s) => void setStatus(i.id, s)} />
                    <button onClick={() => removeItem(i.id)} className="text-xs text-rose-700 underline">Delete</button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {tab === "board" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((status) => {
            const col = items.filter((i) => i.status === status);
            return (
              <section key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{LABEL[status]} ({col.length})</h3>
                <ul className="space-y-2">
                  {col.map((i) => (
                    <li key={i.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <p className="font-medium">{i.title}</p>
                      <p className="text-xs text-slate-500">{i.platform} · {i.publishDate}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <StatusSelect value={i.status} onChange={(s) => void setStatus(i.id, s)} />
                        <button onClick={() => removeItem(i.id)} className="text-xs text-rose-700 underline">Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "accounts" ? (
        <div className="space-y-3">
          <form onSubmit={addAccount} className="flex flex-wrap items-end gap-2">
            <select value={accPlatform} onChange={(e) => setAccPlatform(e.target.value as Platform)} className={field}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" required className={`min-w-[200px] flex-1 ${field}`} />
            <select value={verticalId} onChange={(e) => setVerticalId(e.target.value)} className={field}>
              <option value="">No vertical</option>
              {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add account</button>
          </form>
          {accounts.length === 0 ? <p className="text-sm text-slate-500">No accounts yet.</p> : null}
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{a.platform}</span>
                <span className="flex-1">{a.handle}</span>
                <button onClick={() => removeAccount(a.id)} className="text-xs text-rose-700 underline">Delete</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <select
      aria-label="Change status"
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
    >
      {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
    </select>
  );
}
