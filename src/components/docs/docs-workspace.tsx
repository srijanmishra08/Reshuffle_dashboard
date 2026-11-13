"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const TYPES = ["SOP", "PLAYBOOK", "DECISION", "NOTE", "RESOURCE"] as const;
type DocType = (typeof TYPES)[number];
type DocRow = { id: string; type: DocType; title: string; updatedAt: string };
type DocFull = DocRow & { body: string };

export function DocsWorkspace() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [type, setType] = useState<"" | DocType>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<DocFull | null>(null);
  const [draft, setDraft] = useState<{ title: string; type: DocType; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const listRequest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++listRequest.current;
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (q.trim()) params.set("q", q.trim());
    try {
      const data = await api<DocRow[]>(`/api/docs?${params}`);
      if (mine === listRequest.current) setRows(data);
    } catch (e) {
      if (mine === listRequest.current) setError(e instanceof Error ? e.message : "Could not load docs");
    }
  }, [type, q]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function open(id: string) {
    setError("");
    try {
      const doc = await api<DocFull>(`/api/docs/${id}`);
      setCurrent(doc);
      setDraft({ title: doc.title, type: doc.type, body: doc.body });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open doc");
    }
  }

  function startNew() {
    setCurrent(null);
    setDraft({ title: "", type: "NOTE", body: "" });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const saved = current
        ? await api<DocFull>(`/api/docs/${current.id}`, { method: "PATCH", ...jsonBody(draft) })
        : await api<DocFull>("/api/docs", { method: "POST", ...jsonBody(draft) });
      setCurrent(saved);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!current || !window.confirm("Delete this doc?")) return;
    try {
      await api(`/api/docs/${current.id}`, { method: "DELETE" });
      setCurrent(null);
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search docs"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button onClick={startNew} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">New</button>
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "" | DocType)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => void open(r.id)}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${current?.id === r.id ? "bg-slate-50" : ""}`}
              >
                <span className="block font-medium">{r.title}</span>
                <span className="text-xs text-slate-500">{r.type}</span>
              </button>
            </li>
          ))}
          {rows.length === 0 ? <li className="px-3 py-6 text-center text-sm text-slate-500">No docs found.</li> : null}
        </ul>
      </div>

      {draft ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Title"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as DocType })}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={20}
              placeholder="Write in Markdown"
              className="rounded-xl border border-slate-200 p-3 font-mono text-sm"
            />
            <MarkdownPreview source={draft.body} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void save()}
              disabled={saving || !draft.title.trim()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {current ? (
              <button onClick={() => void remove()} className="rounded-xl border border-rose-200 px-4 py-2 text-sm text-rose-700">
                Delete
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          Select a doc or create a new one.
        </p>
      )}
    </div>
  );
}

/**
 * Minimal safe preview: headings, bullet lists and paragraphs. Everything is rendered as React text
 * (never HTML), so user content cannot inject markup.
 */
function MarkdownPreview({ source }: { source: string }) {
  const blocks = source.split(/\n{2,}/);
  return (
    <div className="space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      {blocks.map((block, i) => {
        const heading = /^(#{1,3})\s+(.*)$/.exec(block);
        if (heading) {
          const size = ["text-lg", "text-base", "text-sm"][heading[1].length - 1];
          return <p key={i} className={`font-semibold ${size}`}>{heading[2]}</p>;
        }
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5">
              {lines.map((l, j) => <li key={j}>{l.replace(/^\s*[-*]\s+/, "")}</li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-wrap">{block}</p>;
      })}
    </div>
  );
}
