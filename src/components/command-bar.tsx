"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Search } from "lucide-react";
import { api } from "@/lib/api";
import { pollWhileVisible } from "@/lib/poll";

type Hit = { type: string; id: string; title: string; subtitle: string; href: string };
type Notice = { id: string; kind: string; title: string; detail: string; href: string; tone: "warn" | "info" | "good" };

const toneDot = { warn: "bg-amber-500", info: "bg-sky-500", good: "bg-emerald-500" } as const;

/** Search box (Cmd/Ctrl+K) and the notifications bell, shown at the top of every page. */
export function CommandBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
        setBellOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = query.trim();
    const current = ++seq.current;
    const timer = setTimeout(() => {
      if (term.length < 2) {
        setHits([]);
        setSearchError("");
        return;
      }
      api<Hit[]>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((rows) => {
          if (current !== seq.current) return;
          setHits(rows);
          setSearchError("");
        })
        .catch((e) => current === seq.current && setSearchError(e instanceof Error ? e.message : "Search failed"));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Notice[]>("/api/notifications")
        .then((rows) => alive && setNotices(rows))
        .catch(() => undefined); // The bell is a convenience; pages show their own errors.
    // The first load waits a couple of seconds so the page's own data is fetched first; the bell is a convenience.
    const first = setTimeout(load, 2500);
    const stop = pollWhileVisible(load, 300_000);
    return () => {
      alive = false;
      clearTimeout(first);
      stop();
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const urgent = notices.filter((n) => n.tone === "warn").length;

  return (
    <div className="relative mb-4 flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) go(hits[0].href);
          }}
          placeholder="Search clients, deals, invoices, projects, docs…  (Ctrl/⌘ K)"
          aria-label="Search"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-slate-400"
        />
        {open && query.trim().length >= 2 ? (
          <div className="absolute z-30 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {searchError ? <p className="px-3 py-2 text-sm text-rose-600">{searchError}</p> : null}
            {!searchError && hits.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">No matches.</p> : null}
            {hits.map((h) => (
              <button
                key={`${h.type}-${h.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(h.href)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"
              >
                <span>
                  <span className="font-medium text-slate-900">{h.title}</span>
                  {h.subtitle ? <span className="ml-2 text-xs text-slate-500">{h.subtitle}</span> : null}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{h.type}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button
          onClick={() => setBellOpen((v) => !v)}
          aria-label={`Notifications (${notices.length})`}
          className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:text-slate-900"
        >
          <Bell className="h-4 w-4" />
          {notices.length > 0 ? (
            <span className={`absolute -right-1 -top-1 rounded-full px-1.5 text-[10px] font-semibold text-white ${urgent > 0 ? "bg-rose-600" : "bg-slate-700"}`}>
              {notices.length}
            </span>
          ) : null}
        </button>
        {bellOpen ? (
          <div className="absolute right-0 z-30 mt-1 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {notices.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">Nothing needs attention.</p> : null}
            {notices.map((n) => (
              <Link key={n.id} href={n.href} onClick={() => setBellOpen(false)} className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot[n.tone]}`} />
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{n.kind}</span>
                  <span className="block font-medium text-slate-900">{n.title}</span>
                  {n.detail ? <span className="block text-xs text-slate-500">{n.detail}</span> : null}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
