"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const STATUSES = ["IDEA", "DRAFT", "SCHEDULED", "POSTED"] as const;
type Status = (typeof STATUSES)[number];
const PLATFORMS = ["Instagram", "LinkedIn", "YouTube", "X", "Facebook"] as const;
type Account = { id: string; platform: string; handle: string };
type Content = { id: string; title: string; accountId: string | null; status: Status; publishDate: string | null };

const input = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function MarketingWorkspace() {
  const [month, setMonth] = useState(currentMonth);
  const [view, setView] = useState<"board" | "calendar">("board");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<Content[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [accountId, setAccountId] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("Instagram");
  const [handle, setHandle] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const [acc, content] = await Promise.all([
        api<Account[]>("/api/marketing/accounts"),
        api<Content[]>(`/api/marketing/content?month=${encodeURIComponent(month)}`),
      ]);
      if (mine === request.current) {
        setAccounts(acc);
        setItems(content);
      }
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : "Could not load marketing data");
    }
  }, [month]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    }
  }

  const accountName = (id: string | null) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.platform} ${a.handle}` : "No account";
  };

  function addContent(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("/api/marketing/content", {
        method: "POST",
        ...jsonBody({ title, accountId: accountId || null, publishDate: publishDate || null }),
      });
      setTitle("");
      setPublishDate("");
    }, "Could not add content");
  }

  function addAccount(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("/api/marketing/accounts", { method: "POST", ...jsonBody({ platform, handle }) });
      setHandle("");
    }, "Could not add account");
  }

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leading = (new Date(y, m - 1, 1).getDay() + 6) % 7;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Month</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={input} />
        </label>
        <div className="flex gap-1">
          {(["board", "calendar"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-xl px-3 py-2 text-sm ${view === v ? "bg-slate-900 text-white" : "border border-slate-200"}`}>
              {v === "board" ? "Board" : "Calendar"}
            </button>
          ))}
        </div>
        <form onSubmit={addContent} className="flex flex-1 flex-wrap items-end gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New content idea" required className={`min-w-[200px] flex-1 ${input}`} />
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input} aria-label="Account">
            <option value="">No account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.platform} {a.handle}</option>)}
          </select>
          <input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} className={input} />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
        </form>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {view === "board" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((status) => {
            const col = items.filter((i) => i.status === status);
            return (
              <section key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{status} ({col.length})</h3>
                <ul className="space-y-2">
                  {col.map((i) => (
                    <li key={i.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <p className="font-medium">{i.title}</p>
                      <p className="text-xs text-slate-500">{[accountName(i.accountId), i.publishDate].filter(Boolean).join(" · ")}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <select aria-label="Move content" value={i.status} onChange={(e) => void run(() => api(`/api/marketing/content/${i.id}`, { method: "PATCH", ...jsonBody({ status: e.target.value }) }), "Could not update content")} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                        <button onClick={() => window.confirm("Delete this content?") && void run(() => api(`/api/marketing/content/${i.id}`, { method: "DELETE" }), "Could not delete content")} className="text-xs text-rose-700 underline">Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-1 font-semibold text-slate-500">{d}</div>)}
          {Array.from({ length: leading }, (_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = `${month}-${String(i + 1).padStart(2, "0")}`;
            const dayItems = items.filter((x) => x.publishDate === day);
            return (
              <div key={day} className="min-h-20 rounded-lg border border-slate-200 bg-white p-1">
                <p className="text-slate-400">{i + 1}</p>
                {dayItems.map((x) => <p key={x.id} className="truncate rounded bg-slate-100 px-1" title={`${x.title} (${x.status})`}>{x.title}</p>)}
              </div>
            );
          })}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 p-3">
        <h3 className="mb-2 text-sm font-semibold">Accounts</h3>
        <ul className="mb-3 space-y-1 text-sm">
          {accounts.length === 0 ? <li className="text-slate-500">No accounts yet.</li> : null}
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3">
              <span>{a.platform} {a.handle}</span>
              <button onClick={() => void run(() => api(`/api/marketing/accounts/${a.id}`, { method: "DELETE" }), "Could not delete account")} className="text-xs text-rose-700 underline">Delete</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addAccount} className="flex flex-wrap gap-2">
          <select value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])} className={input}>
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" required className={input} />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add account</button>
        </form>
      </section>
    </div>
  );
}
