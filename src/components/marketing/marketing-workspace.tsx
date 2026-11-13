"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const STATUSES = ["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"] as const;
type Status = (typeof STATUSES)[number];
const LABEL: Record<Status, string> = { IDEA: "Idea", DRAFT: "Draft", SCHEDULED: "Scheduled", PUBLISHED: "Published" };
const PLATFORMS = ["INSTAGRAM", "LINKEDIN", "YOUTUBE", "X", "FACEBOOK", "OTHER"] as const;

type Account = { id: string; platform: string; handle: string; active: boolean };
type Item = {
  id: string;
  title: string;
  status: Status;
  scheduledDate: string | null;
  accountId: string | null;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** Cells for a month grid starting on Monday: null pads, then day numbers. */
function monthCells(month: string): (number | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

export function MarketingWorkspace() {
  const [month, setMonth] = useState(currentMonth);
  const [view, setView] = useState<"calendar" | "board" | "accounts">("calendar");
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("INSTAGRAM");
  const [handle, setHandle] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const [content, accs] = await Promise.all([
        api<Item[]>(view === "calendar" ? `/api/content-items?month=${encodeURIComponent(month)}` : "/api/content-items"),
        api<Account[]>("/api/social-accounts"),
      ]);
      // The board shows every item, including undated ideas; the calendar is month-scoped.
      if (mine === request.current) {
        setItems(content);
        setAccounts(accs);
      }
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : "Could not load marketing data");
    }
  }, [month, view]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    }
  }

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/content-items", {
        method: "POST",
        ...jsonBody({
          title,
          scheduledDate: date || null,
          accountId: accountId || null,
          status: date ? "SCHEDULED" : "IDEA",
        }),
      });
      setTitle("");
      setDate("");
    }, "Could not add item");
  };

  const addAccount = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/social-accounts", { method: "POST", ...jsonBody({ platform, handle }) });
      setHandle("");
    }, "Could not add account");
  };

  const move = (item: Item, status: Status) => {
    if (status === "SCHEDULED" && !item.scheduledDate) {
      setError("Set a date before scheduling: add the item again with a date.");
      return;
    }
    void run(() => api(`/api/content-items/${item.id}`, { method: "PATCH", ...jsonBody({ status }) }), "Could not update item");
  };

  const remove = (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    void run(() => api(`/api/content-items/${id}`, { method: "DELETE" }), "Could not delete item");
  };

  const accountName = (id: string | null) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.platform.toLowerCase()} @${a.handle}` : "";
  };

  const input = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs text-slate-500">Month</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={input} />
        </label>
        <div className="flex gap-1">
          {(["calendar", "board", "accounts"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-xl px-3 py-2 text-sm capitalize ${view === v ? "bg-slate-900 text-white" : "border border-slate-200"}`}
            >
              {v}
            </button>
          ))}
        </div>
        {view !== "accounts" ? (
          <form onSubmit={addItem} className="flex flex-1 flex-wrap items-end gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New post idea" required className={`min-w-[200px] flex-1 ${input}`} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input}>
              <option value="">No account</option>
              {accounts.filter((a) => a.active).map((a) => (
                <option key={a.id} value={a.id}>{a.platform.toLowerCase()} @{a.handle}</option>
              ))}
            </select>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
          </form>
        ) : null}
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {view === "calendar" ? (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-1 font-semibold uppercase text-slate-500">{d}</div>
          ))}
          {monthCells(month).map((day, i) => {
            const key = day ? `${month}-${String(day).padStart(2, "0")}` : "";
            const todays = day ? items.filter((it) => it.scheduledDate === key) : [];
            return (
              <div key={i} className={`min-h-24 rounded-lg border p-1 ${day ? "border-slate-200 bg-white" : "border-transparent"}`}>
                {day ? <p className="text-slate-400">{day}</p> : null}
                {todays.map((it) => (
                  <p key={it.id} title={`${it.title} (${LABEL[it.status]})`} className="mt-1 truncate rounded bg-slate-100 px-1 py-0.5">
                    {it.title}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "board" ? (
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
                      <p className="text-xs text-slate-500">{[it.scheduledDate, accountName(it.accountId)].filter(Boolean).join(" · ")}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <select aria-label="Move item" value={it.status} onChange={(e) => move(it, e.target.value as Status)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                          {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                        </select>
                        <button onClick={() => remove(it.id)} className="text-xs text-rose-700 underline">Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}

      {view === "accounts" ? (
        <div className="space-y-3">
          <form onSubmit={addAccount} className="flex flex-wrap items-end gap-2">
            <select value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])} className={input}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Handle" required className={input} />
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add account</button>
          </form>
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <span>{a.platform.toLowerCase()} @{a.handle}{a.active ? "" : " (inactive)"}</span>
                <button
                  onClick={() => void run(() => api(`/api/social-accounts/${a.id}`, { method: "PATCH", ...jsonBody({ active: !a.active }) }), "Could not update account")}
                  className="text-xs underline"
                >
                  {a.active ? "Mark inactive" : "Mark active"}
                </button>
              </li>
            ))}
            {accounts.length === 0 ? <li className="text-sm text-slate-500">No accounts yet.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
