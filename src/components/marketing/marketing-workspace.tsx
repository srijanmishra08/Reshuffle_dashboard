"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const STATUSES = ["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"] as const;
type Status = (typeof STATUSES)[number];
const PLATFORMS = ["INSTAGRAM", "LINKEDIN", "YOUTUBE", "X", "WHATSAPP", "OTHER"] as const;
type Platform = (typeof PLATFORMS)[number];
const LABEL: Record<Status, string> = { IDEA: "Idea", DRAFT: "Draft", SCHEDULED: "Scheduled", PUBLISHED: "Published" };

type Account = { id: string; platform: Platform; handle: string };
type Item = { id: string; title: string; platform: Platform; status: Status; publishDate: string | null; accountId: string | null };

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function MarketingWorkspace() {
  const [month, setMonth] = useState(currentMonth);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform>("INSTAGRAM");
  const [accountId, setAccountId] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [handle, setHandle] = useState("");
  const [acctPlatform, setAcctPlatform] = useState<Platform>("INSTAGRAM");
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const [content, accts] = await Promise.all([
        api<Item[]>(`/api/marketing/content?month=${encodeURIComponent(month)}`),
        api<Account[]>("/api/marketing/accounts"),
      ]);
      if (mine === request.current) {
        setItems(content);
        setAccounts(accts);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    }
  }

  function addItem(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("/api/marketing/content", {
        method: "POST",
        ...jsonBody({ title, platform, accountId: accountId || null, publishDate: publishDate || null }),
      });
      setTitle("");
      setPublishDate("");
    }, "Could not add content");
  }

  function addAccount(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("/api/marketing/accounts", { method: "POST", ...jsonBody({ platform: acctPlatform, handle }) });
      setHandle("");
    }, "Could not add account");
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Accounts</h2>
        <ul className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm">
              <span className="text-xs text-slate-500">{a.platform}</span>
              {a.handle}
              <button
                onClick={() => void run(() => api(`/api/marketing/accounts/${a.id}`, { method: "PATCH", ...jsonBody({ archived: true }) }), "Could not archive")}
                className="text-xs text-rose-700 underline"
              >
                Archive
              </button>
            </li>
          ))}
          {accounts.length === 0 ? <li className="text-sm text-slate-500">No accounts yet.</li> : null}
        </ul>
        <form onSubmit={addAccount} className="flex flex-wrap gap-2">
          <select value={acctPlatform} onChange={(e) => setAcctPlatform(e.target.value as Platform)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" required className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add account</button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-slate-500">Month</span>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <form onSubmit={addItem} className="flex flex-1 flex-wrap items-end gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New content idea" required className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">No account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.handle}</option>)}
            </select>
            <input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
          </form>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((status) => {
            const col = items.filter((i) => i.status === status);
            return (
              <section key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {LABEL[status]} ({col.length})
                </h3>
                <ul className="space-y-2">
                  {col.map((i) => (
                    <li key={i.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <p className="font-medium">{i.title}</p>
                      <p className="text-xs text-slate-500">{[i.platform, i.publishDate].filter(Boolean).join(" · ")}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          aria-label="Move content"
                          value={i.status}
                          onChange={(e) => void run(() => api(`/api/marketing/content/${i.id}`, { method: "PATCH", ...jsonBody({ status: e.target.value }) }), "Could not update")}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                        </select>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this item?")) void run(() => api(`/api/marketing/content/${i.id}`, { method: "DELETE" }), "Could not delete");
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
      </section>
    </div>
  );
}
