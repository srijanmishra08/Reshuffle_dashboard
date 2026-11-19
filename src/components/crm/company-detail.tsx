"use client";

import { LinkedDocs } from "@/components/docs/linked-docs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, jsonBody } from "@/lib/api";
import { ClientHub } from "@/components/crm/client-hub";
import { ProjectProgress } from "@/components/projects/project-progress";
import {
  formatDate,
  isOverdue,
  lifecycleStages,
  localToIso,
  type Company,
  type Contact,
  type Interaction,
  type Lifecycle,
  type Meeting,
} from "@/lib/crm-types";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
const interactionTypes = ["CALL", "MEETING", "WHATSAPP", "EMAIL", "NOTE", "SITE_VISIT"] as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function CompanyDetail({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [moduleOptions, setModuleOptions] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState("Loading...");
  const [loaded, setLoaded] = useState(false);

  const base = `/api/companies/${companyId}`;

  // Only the newest load may write state; older (out-of-order) responses are dropped.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const [c, ct, it, mt] = await Promise.all([
      api<Company>(base),
      api<Contact[]>(`${base}/contacts`),
      api<Interaction[]>(`${base}/interactions`),
      api<Meeting[]>(`${base}/meetings`),
    ]);
    if (seq !== loadSeq.current) return;
    setCompany(c);
    setContacts(ct);
    setInteractions(it);
    setMeetings(mt);
    setLoaded(true);
    setMessage("");
  }, [base]);

  useEffect(() => {
    void api<{ id: string; name: string; active: boolean }[]>("/api/modules")
      .then((rows) => setModuleOptions(rows.filter((m) => m.active)))
      .catch(() => setMessage("Could not load modules"));
    const timer = window.setTimeout(() => {
      void load().catch((error: Error) => setMessage(error.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<unknown>, success = "Saved.") => {
      try {
        await action();
        await load();
        setMessage(success);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Something went wrong");
      }
    },
    [load]
  );

  if (!loaded || !company) {
    return <p className="text-sm text-slate-600">{message}</p>;
  }

  const pending = interactions.filter((i) => i.nextActionAt && !i.nextActionDoneAt);
  const timeline = [
    ...interactions.map((i) => ({ kind: "interaction" as const, at: i.at, i })),
    ...meetings.map((m) => ({ kind: "meeting" as const, at: m.at, m })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-4">
      <Link href="/crm" className="text-sm text-slate-600 hover:underline">← All clients</Link>

      <Header
        company={company}
        moduleOptions={moduleOptions}
        onPatch={(patch) => run(() => api(base, { method: "PATCH", ...jsonBody(patch) }))}
        onArchive={async () => {
          if (!window.confirm(`Delete ${company.name}? It will be removed from the client list. Its deals, invoices and history are kept.`)) return;
          try {
            await api(base, { method: "DELETE" });
            router.push("/crm");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not delete the client");
          }
        }}
      />

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <Card title="Projects">
        <ProjectProgress companyId={companyId} />
      </Card>

      <Card title="Documents">
        <LinkedDocs companyId={companyId} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card title="Log a touch">
            <InteractionForm
              contacts={contacts}
              onSubmit={(body) => run(() => api(`${base}/interactions`, { method: "POST", ...jsonBody(body) }), "Logged.")}
            />
          </Card>

          <Card title="Timeline">
            {timeline.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : null}
            <ul className="space-y-3">
              {timeline.map((entry) =>
                entry.kind === "interaction" ? (
                  <li key={entry.i.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                    <p className="text-xs text-slate-500">
                      {formatDate(entry.i.at)} · {entry.i.type}
                      {entry.i.contactName ? ` · ${entry.i.contactName}` : ""}
                      {entry.i.dealId ? <> · <Link href={`/sales/${entry.i.dealId}`} className="underline">Lead</Link></> : null}
                    </p>
                    <p className="text-slate-900">{entry.i.summary}</p>
                    {entry.i.nextAction ? (
                      <p className="text-xs text-slate-500">
                        Next: {entry.i.nextAction} ({formatDate(entry.i.nextActionAt)}
                        {entry.i.nextActionDoneAt ? ", done" : ""})
                      </p>
                    ) : null}
                  </li>
                ) : (
                  <li key={entry.m.id} className="border-l-2 border-sky-300 pl-3 text-sm">
                    <p className="text-xs text-slate-500">
                      {formatDate(entry.m.at)} · MEETING{entry.m.location ? ` · ${entry.m.location}` : ""}
                      {entry.m.dealId ? <> · <Link href={`/sales/${entry.m.dealId}`} className="underline">Lead</Link></> : null}
                    </p>
                    <p className="text-slate-900">{entry.m.title}</p>
                    {entry.m.notes ? <p className="text-xs text-slate-500">{entry.m.notes}</p> : null}
                  </li>
                )
              )}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Next actions">
            {pending.length === 0 ? <p className="text-sm text-slate-500">No pending next actions.</p> : null}
            <ul className="space-y-2">
              {pending.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="text-slate-900">{i.nextAction}</p>
                    <p className={`text-xs ${isOverdue(i.nextActionAt) ? "font-medium text-red-700" : "text-slate-500"}`}>
                      {formatDate(i.nextActionAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void run(() => api(`${base}/interactions/${i.id}`, { method: "PATCH", ...jsonBody({ done: true }) }), "Marked done.")}
                    className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100"
                  >
                    Done
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Contacts">
            <ContactsList
              contacts={contacts}
              onToggle={(contact, field) => run(() => api(`${base}/contacts/${contact.id}`, { method: "PATCH", ...jsonBody({ [field]: !contact[field] }) }))}
              onArchive={(contact) => run(() => api(`${base}/contacts/${contact.id}`, { method: "DELETE" }), "Contact removed.")}
            />
            <ContactForm onSubmit={(body) => run(() => api(`${base}/contacts`, { method: "POST", ...jsonBody(body) }), "Contact added.")} />
          </Card>

          <Card title="Schedule a meeting">
            <MeetingForm onSubmit={(body) => run(() => api(`${base}/meetings`, { method: "POST", ...jsonBody(body) }), "Meeting added.")} />
          </Card>

          <ClientHub companyId={companyId} />
        </div>
      </div>
    </div>
  );
}

function Header({
  company,
  onPatch,
  onArchive,
  moduleOptions,
}: {
  company: Company;
  moduleOptions: { id: string; name: string }[];
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const selectedIds = company.modules.map((m) => m.id);
  // Library modules, plus any the client has that were since switched off, so they can still be removed.
  const moduleChoices = [...moduleOptions, ...company.modules.filter((m) => !moduleOptions.some((o) => o.id === m.id))];
  const [edit, setEdit] = useState({ name: "", legalName: "", website: "", address: "", source: "", referrer: "" });
  const startEdit = () => {
    setEdit({
      name: company.name,
      legalName: company.legalName ?? "",
      website: company.website ?? "",
      address: company.address ?? "",
      source: company.source ?? "",
      referrer: company.referrer ?? "",
    });
    setEditing(true);
  };
  const setField = (key: keyof typeof edit) => (e: { target: { value: string } }) => setEdit({ ...edit, [key]: e.target.value });
  const [gstin, setGstin] = useState(company.gstin ?? "");
  const [stateCode, setStateCode] = useState(company.stateCode ?? "");
  const [notes, setNotes] = useState(company.notes ?? "");

  return (
    <Card title={company.name}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">
          Lifecycle
          <select value={company.lifecycle} onChange={(e) => void onPatch({ lifecycle: e.target.value as Lifecycle })} className={`${inputClass} mt-1`}>
            {lifecycleStages.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          GSTIN
          <input value={gstin} onChange={(e) => setGstin(e.target.value)} onBlur={() => gstin !== (company.gstin ?? "") && void onPatch({ gstin })} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          State code
          <input value={stateCode} onChange={(e) => setStateCode(e.target.value)} onBlur={() => stateCode !== (company.stateCode ?? "") && void onPatch({ stateCode })} className={`${inputClass} mt-1`} />
        </label>
      </div>
      <fieldset className="mt-3 text-xs font-medium text-slate-600">
        <legend>Modules (SKUs) this client is in</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {moduleChoices.length === 0 ? <span className="font-normal text-slate-400">No modules in the library yet.</span> : null}
          {moduleChoices.map((m) => {
            const on = selectedIds.includes(m.id);
            return (
              <label
                key={m.id}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-normal ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => void onPatch({ moduleIds: on ? selectedIds.filter((id) => id !== m.id) : [...selectedIds, m.id] })}
                />
                {m.name}
              </label>
            );
          })}
        </div>
      </fieldset>
      {editing ? (
        <form
          className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onPatch(edit).then(() => setEditing(false));
          }}
        >
          <label className="text-xs font-medium text-slate-600">
            Name
            <input required value={edit.name} onChange={setField("name")} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Legal name
            <input value={edit.legalName} onChange={setField("legalName")} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Website
            <input value={edit.website} onChange={setField("website")} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Address
            <input value={edit.address} onChange={setField("address")} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Lead source
            <input value={edit.source} onChange={setField("source")} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Referred by
            <input value={edit.referrer} onChange={setField("referrer")} className={`${inputClass} mt-1`} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Save changes</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {company.legalName ? `${company.legalName} · ` : ""}
            Source: {company.source ?? "n/a"}{company.referrer ? ` · Referred by ${company.referrer}` : ""}
            {company.website ? ` · ${company.website}` : ""}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={startEdit} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Edit details</button>
            <button type="button" onClick={() => void onArchive()} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50">Delete client</button>
          </div>
        </div>
      )}
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (company.notes ?? "") && void onPatch({ notes })} rows={2} className={`${inputClass} mt-1`} />
      </label>
    </Card>
  );
}

function InteractionForm({ contacts, onSubmit }: { contacts: Contact[]; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [type, setType] = useState<(typeof interactionTypes)[number]>("CALL");
  const [summary, setSummary] = useState("");
  const [contactId, setContactId] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      type,
      summary,
      contactId: contactId || undefined,
      nextAction: nextAction || undefined,
      nextActionAt: localToIso(nextActionAt),
    });
    setSummary("");
    setNextAction("");
    setNextActionAt("");
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={inputClass}>
          {interactionTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputClass}>
          <option value="">No contact</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <textarea required value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happened?" rows={2} className={inputClass} />
      <div className="flex gap-2">
        <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action (optional)" className={inputClass} />
        <input type="datetime-local" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} className={inputClass} />
      </div>
      <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Log</button>
    </form>
  );
}

function ContactsList({
  contacts,
  onToggle,
  onArchive,
}: {
  contacts: Contact[];
  onToggle: (contact: Contact, field: "onboarded" | "approved") => Promise<void>;
  onArchive: (contact: Contact) => Promise<void>;
}) {
  if (contacts.length === 0) {
    return <p className="text-sm text-slate-500">No contacts yet.</p>;
  }

  return (
    <ul className="mb-3 space-y-3">
      {contacts.map((contact) => (
        <li key={contact.id} className="text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-slate-900">{contact.name}{contact.role ? ` · ${contact.role}` : ""}</p>
              <p className="text-xs text-slate-500">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p>
              {contact.whatsappRole ? <p className="text-xs text-slate-500">WhatsApp: {contact.whatsappRole}</p> : null}
            </div>
            <button type="button" onClick={() => void onArchive(contact)} className="text-xs text-slate-400 hover:text-red-600">Remove</button>
          </div>
          <div className="mt-1 flex gap-3 text-xs text-slate-600">
            <label className="flex items-center gap-1"><input type="checkbox" checked={contact.onboarded} onChange={() => void onToggle(contact, "onboarded")} /> Onboarded</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={contact.approved} onChange={() => void onToggle(contact, "approved")} /> Approved</label>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ContactForm({ onSubmit }: { onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappRole, setWhatsappRole] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ name, role, phone, email, whatsappRole: whatsappRole || null });
    setName("");
    setRole("");
    setPhone("");
    setEmail("");
    setWhatsappRole("");
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2 border-t border-slate-100 pt-3">
      <div className="flex gap-2">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inputClass} />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className={inputClass} />
      </div>
      <div className="flex gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputClass} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
      </div>
      <select value={whatsappRole} onChange={(e) => setWhatsappRole(e.target.value)} className={inputClass}>
        <option value="">WhatsApp role: none</option>
        <option value="CLIENT">Client</option>
        <option value="CLIENT_TEAM">Client team</option>
      </select>
      <button type="submit" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-100">Add contact</button>
    </form>
  );
}

function MeetingForm({ onSubmit }: { onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [location, setLocation] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({ title, at: localToIso(at), location });
    setTitle("");
    setAt("");
    setLocation("");
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputClass} />
      <div className="flex gap-2">
        <input required type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={inputClass} />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location or link" className={inputClass} />
      </div>
      <button type="submit" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-100">Add meeting</button>
    </form>
  );
}
