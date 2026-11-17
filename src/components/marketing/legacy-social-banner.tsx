"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

/**
 * Offers to move every entry on this older social calendar into Marketing's content calendar. Shown only while
 * there are entries to move. Entries are removed here only after the copies exist in Marketing.
 */
export function LegacySocialBanner({ count, onMoved }: { count: number; onMoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ moved: number; attached: number } | null>(null);

  async function move() {
    if (!window.confirm(`Move all ${count} entries to the Marketing content calendar? They are removed from this page once copied.`)) return;
    setBusy(true);
    setError("");
    try {
      setDone(await api<{ moved: number; attached: number }>("/api/legacy/social", { method: "POST" }));
      onMoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the entries");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        Moved {done.moved} entries to <Link href="/marketing" className="font-medium underline">Marketing</Link>
        {done.attached < done.moved ? `. ${done.moved - done.attached} have the platform written in their caption because Marketing has no single account for it.` : "."}
      </p>
    );
  }
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <span>This is the older social calendar. Marketing has the same calendar linked to your social accounts. Move these {count} entries there.</span>
      <span className="flex items-center gap-3">
        {error ? <span className="text-rose-700">{error}</span> : null}
        <button disabled={busy} onClick={() => void move()} className="rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {busy ? "Moving…" : "Move to Marketing"}
        </button>
      </span>
    </div>
  );
}
