"use client";

import { useCallback, useEffect, useState } from "react";
import { api, jsonBody } from "@/lib/api";

const buttons = [
  { as: "CLIENT", label: "Login as client", home: "/portal", note: "Projects, work to approve, invoices" },
  { as: "FREELANCER", label: "Login as freelancer", home: "/me", note: "Own tasks and payouts" },
  { as: "AGENCY", label: "Login as agency", home: "/agency", note: "Team tasks and payouts" },
] as const;

/**
 * Admin-only. Opens each outside portal exactly as that person sees it, filled with demo data kept apart from
 * the real records. You stay signed in as yourself, and no email is added to the allowlist.
 */
export function PreviewPanel() {
  const [seeded, setSeeded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setSeeded((await api<{ seeded: boolean }>("/api/demo")).seeded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the demo data");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy("");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">See how the logins look</h3>
      <p className="mt-1 text-xs text-slate-500">
        Opens each portal as that person sees it, with made-up demo data. You stay signed in as yourself and nothing real is shown or changed. An &ldquo;Exit preview&rdquo; bar appears at the top.
      </p>
      {error ? <p className="mt-2 text-sm text-rose-600" role="alert">{error}</p> : null}

      {seeded === false ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            disabled={busy !== ""}
            onClick={() => void run("seed", async () => { await api("/api/demo", { method: "POST" }); await load(); setBusy(""); })}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "seed" ? "Setting up…" : "Set up demo data"}
          </button>
          <span className="text-xs text-slate-500">Creates a fake client, project, team and invoices, kept separate from real records.</span>
        </div>
      ) : null}

      {seeded ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {buttons.map((b) => (
              <button
                key={b.as}
                disabled={busy !== ""}
                onClick={() =>
                  void run(b.as, async () => {
                    await api("/api/preview", { method: "POST", ...jsonBody({ as: b.as }) });
                    window.location.href = b.home;
                  })
                }
                className="rounded-xl border border-slate-300 px-4 py-3 text-left hover:border-slate-900 disabled:opacity-50"
              >
                <span className="block text-sm font-semibold text-slate-900">{busy === b.as ? "Opening…" : b.label}</span>
                <span className="block text-xs text-slate-500">{b.note}</span>
              </button>
            ))}
          </div>
          <button
            disabled={busy !== ""}
            onClick={() => {
              if (!window.confirm("Remove the demo data? The preview buttons stop working until you set it up again.")) return;
              void run("remove", async () => { await api("/api/demo", { method: "DELETE" }); await load(); setBusy(""); });
            }}
            className="mt-3 text-xs text-slate-500 underline disabled:opacity-50"
          >
            Remove demo data
          </button>
        </>
      ) : null}
    </section>
  );
}
