"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Status = { connected: boolean; revoked: boolean; email: string | null };
type Message = { id: string; kind: string; to: string; subject: string; status: string; attempts: number; lastError: string | null; createdAt: string };

const tone: Record<string, string> = {
  SENT: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-amber-50 text-amber-700",
  DEAD: "bg-rose-50 text-rose-700",
  QUEUED: "bg-slate-100 text-slate-600",
  SENDING: "bg-slate-100 text-slate-600",
};

/** Admin card: connect the company Gmail once, then watch what was sent and what failed. */
export function MailSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [outbox, setOutbox] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([api<Status>("/api/mail/status"), api<Message[]>("/api/mail/outbox?limit=20")]);
      setStatus(s);
      setOutbox(o);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load email settings");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mail") === "connected") setNotice("Gmail connected.");
      if (params.get("mail") === "error") setError(params.get("mailMessage") ?? "Could not connect Gmail");
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function disconnect() {
    if (!window.confirm("Disconnect Gmail? Nothing can be emailed until you connect it again.")) return;
    setBusy(true);
    try {
      await api("/api/mail/disconnect", { method: "POST" });
      setNotice("Gmail disconnected.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-800">Email (Gmail)</h3>
      <p className="mt-1 text-xs text-slate-500">
        Follow-ups, portal invitations, scope links and the daily digest are sent from one connected Gmail account. Only the permission to send is requested.
      </p>
      {error ? <p className="mt-2 text-sm text-rose-600" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-emerald-700">{notice}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {status === null ? (
          <span className="text-slate-500">Loading...</span>
        ) : status.connected ? (
          <>
            <span className="text-slate-800">Sending as <strong>{status.email}</strong></span>
            <button disabled={busy} onClick={() => void disconnect()} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50">Disconnect</button>
          </>
        ) : (
          <>
            <span className="text-slate-600">{status.revoked ? `Access for ${status.email} was revoked. Connect again.` : "Not connected."}</span>
            <a href="/api/mail/connect" className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">Connect Gmail</a>
          </>
        )}
      </div>
      {outbox.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500">
              <tr><th className="px-2 py-1.5">When</th><th className="px-2 py-1.5">To</th><th className="px-2 py-1.5">Subject</th><th className="px-2 py-1.5">Status</th></tr>
            </thead>
            <tbody>
              {outbox.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 whitespace-nowrap">{new Date(m.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-2 py-1.5">{m.to}</td>
                  <td className="px-2 py-1.5">{m.subject}</td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${tone[m.status] ?? ""}`}>{m.status}</span>
                    {m.lastError && m.status !== "SENT" ? <span className="ml-2 text-slate-500">{m.lastError}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
