"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const STATUSES = ["IDEA", "DRAFT", "SCHEDULED", "POSTED"] as const;
type Status = (typeof STATUSES)[number];
const PLATFORMS = ["Instagram", "LinkedIn", "YouTube", "X", "Facebook", "Other"] as const;
type Platform = (typeof PLATFORMS)[number];

type Account = { id: string; platform: Platform; handle: string; vertical: string | null; active: boolean };
type Content = {
  id: string;
  title: string;
  platform: Platform;
  status: Status;
  scheduledDate: string | null;
  accountId: string | null;
};

const input = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

export function MarketingWorkspace() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [items, setItems] = useState<Content[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [date, setDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [acctPlatform, setAcctPlatform] = useState<Platform>("Instagram");
  const [handle, setHandle] = useState("");
  const [vertical, setVertical] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const [a, c] = await Promise.all([
        api<Account[]>("/api/marketing/accounts"),
        api<Content[]>("/api/marketing/content"),
      ]);
      if (mine !== request.current) return;
      setAccounts(a);
      setItems(c);
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : "Could not load marketing data");
    }
  }, []);

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

  async function addContent(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api("/api/marketing/content", {
        method: "POST",
        ...jsonBody({ title, platform, scheduledDate: date || null, accountId: accountId || null }),
      });
      setTitle("");
      setDate("");
    }, "Could not add content");
  }

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api("/api/marketing/accounts", {
        method: "POST",
        ...jsonBody({ platform: acctPlatform, handle, vertical }),
      });
      setHandle("");
      setVertical("");
    }, "Could not add account");
  }

  const accountName = (id: string | null) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.platform} ${a.handle}` : null;
  };

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <form onSubmit={addContent} className="flex flex-wrap items-end gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New content idea" required className={`${input} min-w-[200px] flex-1`} />
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className={input}>
          {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input} aria-label="Account">
          <option value="">No account</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.platform} {a.handle}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
      </form>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((status) => {
          const col = items.filter((i) => i.status === status);
          return (
            <section key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {status} ({col.length})
              </h3>
              <ul className="space-y-2">
                {col.map((i) => (
                  <li key={i.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                    <p className="font-medium">{i.title}</p>
                    <p className="text-xs text-slate-500">
                      {[i.platform, accountName(i.accountId), i.scheduledDate].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        aria-label="Move content"
                        value={i.status}
                        onChange={(e) =>
                          void run(
                            () => api(`/api/marketing/content/${i.id}`, { method: "PATCH", ...jsonBody({ status: e.target.value }) }),
                            "Could not update content"
                          )
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      >
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                      <button
                        onClick={() => {
                          if (window.confirm("Delete this item?"))
                            void run(() => api(`/api/marketing/content/${i.id}`, { method: "DELETE" }), "Could not delete");
                        }}
                        className="text-xs text-rose-700 underline"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Accounts</h2>
        <form onSubmit={addAccount} className="flex flex-wrap items-end gap-2">
          <select value={acctPlatform} onChange={(e) => setAcctPlatform(e.target.value as Platform)} className={input}>
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" required className={input} />
          <input value={vertical} onChange={(e) => setVertical(e.target.value)} placeholder="Vertical (optional)" className={input} />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add account</button>
        </form>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
          {accounts.length === 0 ? <li className="p-3 text-slate-500">No accounts yet.</li> : null}
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between p-3">
              <span>{a.platform} {a.handle}{a.vertical ? ` · ${a.vertical}` : ""}{a.active ? "" : " (inactive)"}</span>
              <button
                onClick={() => {
                  if (window.confirm("Delete this account? Its content is kept."))
                    void run(() => api(`/api/marketing/accounts/${a.id}`, { method: "DELETE" }), "Could not delete");
                }}
                className="text-xs text-rose-700 underline"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
