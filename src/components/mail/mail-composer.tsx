"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import type { Contact } from "@/lib/crm-types";

type Props = {
  kind: "FOLLOWUP" | "OUTREACH";
  companyId: string;
  contactId?: string;
  dealId?: string | null;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  onClose: () => void;
  onSent?: () => void;
};

const field = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";

/**
 * A small compose box that sends through the connected Gmail mailbox. One key per open box, so a double click or a
 * retry after a slow response never sends the message twice.
 */
export function MailComposer({ kind, companyId, contactId, dealId, defaultTo = "", defaultSubject = "", defaultBody = "", onClose, onSent }: Props) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [remember, setRemember] = useState(true);
  const [rememberName, setRememberName] = useState("");
  const key = useRef(crypto.randomUUID());
  const listId = useId();

  useEffect(() => {
    let live = true;
    api<Contact[]>(`/api/companies/${companyId}/contacts`)
      .then((rows) => {
        if (!live) return;
        setContacts(rows.filter((c) => c.email));
        setTo((current) => current || rows.find((c) => c.email)?.email || "");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [companyId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const matched = contacts.find((c) => c.email?.toLowerCase() === to.trim().toLowerCase());
      const address = to.trim().toLowerCase();
      const result = await api<{ status: string; lastError: string | null }>("/api/mail/send", {
        method: "POST",
        ...jsonBody({ kind, to, subject, body, companyId, dealId: dealId ?? undefined, contactId: contactId ?? matched?.id, idempotencyKey: key.current }),
      });
      if (result.status === "SENT") {
        setSent(`Sent to ${to}`);
        if (!matched && remember) {
          // Keep the address on the client so the next email is pre-filled. A failure here must not hide the send.
          await api(`/api/companies/${companyId}/contacts`, {
            method: "POST",
            ...jsonBody({ name: rememberName.trim() || address.split("@")[0], email: address }),
          }).catch(() => undefined);
        }
        onSent?.();
      } else {
        setError(`Not sent yet (${result.lastError ?? "will retry"}). It stays in the outbox and is retried automatically.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label className="block text-xs text-slate-500">
        To
        <input required type="email" list={listId} value={to} onChange={(e) => setTo(e.target.value)} className={field} />
        <datalist id={listId}>
          {contacts.map((c) => (
            <option key={c.id} value={c.email ?? ""}>{c.name}</option>
          ))}
        </datalist>
      </label>
      <label className="block text-xs text-slate-500">
        Subject
        <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
      </label>
      <label className="block text-xs text-slate-500">
        Message
        <textarea required rows={5} value={body} onChange={(e) => setBody(e.target.value)} className={field} />
      </label>
      {!sent && to.includes("@") && !contacts.some((c) => c.email?.toLowerCase() === to.trim().toLowerCase()) ? (
        <div className="space-y-1 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Save this address as a contact on the client
          </label>
          {remember ? (
            <input
              value={rememberName}
              onChange={(e) => setRememberName(e.target.value)}
              placeholder="Contact name (optional)"
              className="block w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
            />
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
      {sent ? <p className="text-xs text-emerald-700">{sent}. It is logged on the client.</p> : null}
      <div className="flex gap-2">
        <button disabled={busy || sent !== ""} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {busy ? "Sending..." : "Send email"}
        </button>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-700">
          {sent ? "Close" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
