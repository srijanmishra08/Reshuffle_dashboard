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
type Option = { id: string; name: string };

export function PreviewPanel({ clients, freelancers, agencies }: { clients: Option[]; freelancers: Option[]; agencies: Option[] }) {
  const [real, setReal] = useState<Record<string, string>>({});
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

      <div className="mt-5 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-semibold text-slate-800">Or see a real account exactly as that person sees it</h4>
        <p className="mt-1 text-xs text-slate-500">Uses their real data, so you can check what a client, freelancer or agency will actually see. It is read-only: nothing can be changed from here.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {(
            [
              { as: "CLIENT", label: "Client", options: clients, home: "/portal" },
              { as: "FREELANCER", label: "Freelancer", options: freelancers, home: "/me" },
              { as: "AGENCY", label: "Partner agency", options: agencies, home: "/agency" },
            ] as const
          ).map((r) => (
            <div key={r.as} className="space-y-1.5">
              <select
                aria-label={`Choose a ${r.label.toLowerCase()}`}
                className="block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                value={real[r.as] ?? ""}
                onChange={(e) => setReal({ ...real, [r.as]: e.target.value })}
              >
                <option value="">{r.label}…</option>
                {r.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button
                disabled={busy !== "" || !real[r.as]}
                onClick={() =>
                  void run(`real-${r.as}`, async () => {
                    await api("/api/preview", { method: "POST", ...jsonBody({ as: r.as, recordId: real[r.as] }) });
                    window.location.href = r.home;
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-900 hover:border-slate-900 disabled:opacity-50"
              >
                {busy === `real-${r.as}` ? "Opening…" : `Open as this ${r.label.toLowerCase()}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
