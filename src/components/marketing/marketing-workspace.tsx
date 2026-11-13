"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const STATUSES = ["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"] as const;
type Status = (typeof STATUSES)[number];
const PLATFORMS = ["INSTAGRAM", "LINKEDIN", "YOUTUBE", "FACEBOOK", "X", "WHATSAPP", "OTHER"] as const;
const LABEL: Record<Status, string> = { IDEA: "Ideas", DRAFT: "Drafts", SCHEDULED: "Scheduled", PUBLISHED: "Published" };

type Account = { id: string; platform: string; handle: string; plan: string | null; active: boolean };
type Item = {
  id: string;
  title: string;
  caption: string | null;
  status: Status;
  scheduledDate: string | null;
  accountId: string | null;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** Days of a `YYYY-MM` month, padded with blanks so the first day lands on the right weekday (Mon first). */
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  return cells;
}

export function MarketingWorkspace() {
  const [tab, setTab] = useState<"calendar" | "board" | "accounts">("calendar");
  const [month, setMonth] = useState(currentMonth);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("INSTAGRAM");
  const [handle, setHandle] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      // The board shows undated ideas too, so it loads everything; the calendar only needs the month.
      const query = tab === "calendar" ? `?month=${encodeURIComponent(month)}` : "";
      const [content, accts] = await Promise.all([
        api<Item[]>(`/api/marketing/content${query}`),
        api<Account[]>("/api/marketing/accounts"),
      ]);
      if (mine !== request.current) return;
      setItems(content);
      setAccounts(accts);
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : "Could not load marketing data");
    }
  }, [month, tab]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    }
  }

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("/api/marketing/content", {
        method: "POST",
        ...jsonBody({
          title,
          accountId: accountId || null,
          scheduledDate: date || null,
          status: date ? "SCHEDULED" : "IDEA",
        }),
      });
      setTitle("");
      setDate("");
    }, "Could not add content");
  }

  function addAccount(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("/api/marketing/accounts", { method: "POST", ...jsonBody({ platform, handle }) });
      setHandle("");
    }, "Could not add account");
  }

  const move = (id: string, status: Status) =>
    run(() => api(`/api/marketing/content/${id}`, { method: "PATCH", ...jsonBody({ status }) }), "Could not update item");

  const removeItem = (id: string) => {
    if (!window.confirm("Delete this content item?")) return;
    return run(() => api(`/api/marketing/content/${id}`, { method: "DELETE" }), "Could not delete item");
  };

  const accountName = (id: string | null) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.platform.toLowerCase()} · ${a.handle}` : null;
  };

  const inputCls = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

  const moveSelect = (item: Item) => (
    <select
      aria-label="Move item"
      value={item.status}
      onChange={(e) => void move(item.id, e.target.value as Status)}
      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
    >
      {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["calendar", "board", "accounts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium capitalize ${tab === t ? "bg-slate-900 text-white" : "border border-slate-200 bg-white"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {tab !== "accounts" ? (
        <form onSubmit={addItem} className="flex flex-wrap items-end gap-2">
          {tab === "calendar" ? (
            <input type="month" aria-label="Month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inputCls} />
          ) : null}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New post idea" required className={`min-w-[200px] flex-1 ${inputCls}`} />
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account" className={inputCls}>
            <option value="">No account</option>
            {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.platform.toLowerCase()} · {a.handle}</option>)}
          </select>
          <input type="date" aria-label="Scheduled date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
        </form>
      ) : null}

      {tab === "calendar" ? (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-1 font-semibold uppercase tracking-wide text-slate-500">{d}</div>
          ))}
          {monthCells(month).map((day, i) => (
            <div key={day ?? `blank-${i}`} className={`min-h-24 rounded-lg border p-1 ${day ? "border-slate-200 bg-white" : "border-transparent"}`}>
              {day ? <p className="mb-1 text-slate-400">{Number(day.slice(8))}</p> : null}
              {day
                ? items.filter((it) => it.scheduledDate === day).map((it) => (
                    <div key={it.id} className="mb-1 rounded bg-slate-100 p-1">
                      <p className="font-medium">{it.title}</p>
                      <p className="text-slate-500">{accountName(it.accountId) ?? "no account"}</p>
                      {moveSelect(it)}
                    </div>
                  ))
                : null}
            </div>
          ))}
        </div>
      ) : null}

      {tab === "board" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((status) => {
            const col = items.filter((it) => it.status === status);
            return (
              <section key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{LABEL[status]} ({col.length})</h3>
                <ul className="space-y-2">
                  {col.map((it) => (
                    <li key={it.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <p className="font-medium">{it.title}</p>
                      <p className="text-xs text-slate-500">
                        {[accountName(it.accountId), it.scheduledDate].filter(Boolean).join(" · ") || "unplanned"}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        {moveSelect(it)}
                        <button onClick={() => void removeItem(it.id)} className="text-xs text-rose-700 underline">Delete</button>
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
            <select value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])} aria-label="Platform" className={inputCls}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Handle" required className={`min-w-[200px] flex-1 ${inputCls}`} />
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add account</button>
          </form>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  <span className="font-medium">{a.handle}</span>{" "}
                  <span className="text-slate-500">{a.platform.toLowerCase()}{a.active ? "" : " · inactive"}</span>
                </span>
                <button
                  onClick={() => void run(() => api(`/api/marketing/accounts/${a.id}`, { method: "PATCH", ...jsonBody({ active: !a.active }) }), "Could not update account")}
                  className="text-xs underline"
                >
                  {a.active ? "Deactivate" : "Activate"}
                </button>
              </li>
            ))}
            {accounts.length === 0 ? <li className="p-3 text-sm text-slate-500">No accounts yet.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
