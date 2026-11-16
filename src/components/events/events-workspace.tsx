"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { formatINR, toPaise } from "@/server/lib/money";

const STATUSES = ["PLANNED", "CONFIRMED", "EXECUTED", "ARCHIVED"] as const;
type Status = (typeof STATUSES)[number];
const TYPES = ["SPRINT", "WORKSHOP", "IDEATHON", "BOOTCAMP", "MEETUP"] as const;
const LABEL: Record<Status, string> = {
  PLANNED: "Planned",
  CONFIRMED: "Confirmed",
  EXECUTED: "Executed",
  ARCHIVED: "Archived",
};

type EventRow = {
  id: string;
  name: string;
  type: string;
  status: Status;
  date: string | null;
  venue: string | null;
  capacity: number | null;
  registered: number;
  paidCount: number;
};
type Registration = { id: string; name: string; contact: string | null; paid: boolean; attended: boolean };
type TeamMember = { id: string; name: string; role: string | null };
type EventDetail = EventRow & {
  ticketPricePaise: number;
  partner: string | null;
  sheetUrl: string | null;
  docUrl: string | null;
  notes: string | null;
  team: TeamMember[];
  registrations: Registration[];
  attendedCount: number;
  revenuePaise: number;
};

/** Minimal CSV parse for `name,contact,paid` rows. Quotes are not supported; a header row is skipped. */
export function parseRegistrationCsv(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => l.split(",").map((c) => c.trim()));
  if (rows[0]?.[0].toLowerCase() === "name") rows.shift();
  return rows.map(([name, contact, paid]) => ({
    name: name ?? "",
    contact: contact || null,
    paid: ["yes", "true", "paid", "1"].includes((paid ?? "").toLowerCase()),
  }));
}

export function EventsWorkspace() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("WORKSHOP");
  const [date, setDate] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const data = await api<EventRow[]>("/api/events");
      if (mine === request.current) setEvents(data);
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : "Could not load events");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const created = await api<EventRow>("/api/events", {
        method: "POST",
        ...jsonBody({ name, type, date: date || null }),
      });
      setName("");
      setDate("");
      await load();
      setSelected(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add event");
    }
  }

  async function move(id: string, status: Status) {
    setError("");
    try {
      await api(`/api/events/${id}`, { method: "PATCH", ...jsonBody({ status }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update event");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New event" required className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add</button>
      </form>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((status) => {
          const items = events.filter((ev) => ev.status === status);
          return (
            <section key={status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {LABEL[status]} ({items.length})
              </h3>
              <ul className="space-y-2">
                {items.map((ev) => (
                  <li key={ev.id} className={`rounded-lg border bg-white p-2 text-sm ${selected === ev.id ? "border-slate-900" : "border-slate-200"}`}>
                    <button onClick={() => setSelected(ev.id)} className="text-left font-medium underline-offset-2 hover:underline">
                      {ev.name}
                    </button>
                    <p className="text-xs text-slate-500">
                      {[ev.type, ev.date, `${ev.registered}${ev.capacity != null ? `/${ev.capacity}` : ""} registered`].filter(Boolean).join(" · ")}
                    </p>
                    <select
                      aria-label="Move event"
                      value={ev.status}
                      onChange={(e) => void move(ev.id, e.target.value as Status)}
                      className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {selected ? (
        <EventDetailPanel
          key={selected}
          id={selected}
          onChanged={() => void load()}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function EventDetailPanel({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [regName, setRegName] = useState("");
  const [regContact, setRegContact] = useState("");
  const [csv, setCsv] = useState("");
  const [price, setPrice] = useState("");
  const request = useRef(0);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      const data = await api<EventDetail>(`/api/events/${id}`);
      if (mine === request.current) {
        setEvent(data);
        setPrice((data.ticketPricePaise / 100).toFixed(2));
      }
    } catch (e) {
      if (mine === request.current) setError(e instanceof Error ? e.message : "Could not load event");
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(fn: () => Promise<unknown>, failure: string) {
    setError("");
    try {
      await fn();
      await load();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
      return false;
    }
  }

  const patch = (body: Record<string, unknown>) =>
    run(() => api(`/api/events/${id}`, { method: "PATCH", ...jsonBody(body) }), "Could not save event");

  async function savePrice() {
    let paise: number;
    try {
      paise = Number(toPaise(price));
    } catch {
      setError("Enter the ticket price as rupees, for example 499.00");
      return;
    }
    await patch({ ticketPricePaise: paise });
  }

  async function remove() {
    if (!window.confirm("Delete this event, its team and registrations?")) return;
    try {
      await api(`/api/events/${id}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete event");
    }
  }

  if (!event) return <p className="text-sm text-slate-500">{error || "Loading event…"}</p>;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{event.name}</h2>
          <p className="text-sm text-slate-500">
            {[event.type, event.date, event.venue, event.partner && `with ${event.partner}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <button onClick={onClose} className="underline">Close</button>
          <button onClick={() => void remove()} className="text-rose-700 underline">Delete</button>
        </div>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Registered</dt><dd className="font-medium">{event.registered}{event.capacity != null ? ` / ${event.capacity}` : ""}</dd></div>
        <div><dt className="text-xs text-slate-500">Paid</dt><dd className="font-medium">{event.paidCount}</dd></div>
        <div><dt className="text-xs text-slate-500">Attended</dt><dd className="font-medium">{event.attendedCount}</dd></div>
        <div><dt className="text-xs text-slate-500">Ticket revenue</dt><dd className="font-medium">{formatINR(event.revenuePaise)}</dd></div>
      </dl>

      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label>
          <span className="block text-xs text-slate-500">Ticket price (₹)</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-28 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <button onClick={() => void savePrice()} className="rounded-xl border border-slate-200 px-3 py-2">Save price</button>
        {event.sheetUrl ? <a href={event.sheetUrl} target="_blank" rel="noreferrer noopener" className="underline">Workshop sheet</a> : null}
        {event.docUrl ? <a href={event.docUrl} target="_blank" rel="noreferrer noopener" className="underline">Event doc</a> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Team</h3>
          <ul className="space-y-1 text-sm">
            {event.team.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span>{m.name}{m.role ? ` · ${m.role}` : ""}</span>
                <button onClick={() => void run(() => api(`/api/events/${id}/team/${m.id}`, { method: "DELETE" }), "Could not remove")} className="text-xs text-rose-700 underline">Remove</button>
              </li>
            ))}
            {event.team.length === 0 ? <li className="text-slate-500">No team yet.</li> : null}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api(`/api/events/${id}/team`, { method: "POST", ...jsonBody({ name: memberName, role: memberRole }) }), "Could not add").then((done) => { if (done) { setMemberName(""); setMemberRole(""); } });
            }}
          >
            <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Name" required className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={memberRole} onChange={(e) => setMemberRole(e.target.value)} placeholder="Role" className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <button className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">Add</button>
          </form>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Registrations</h3>
          <ul className="max-h-64 space-y-1 overflow-auto text-sm">
            {event.registrations.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{r.name}{r.contact ? ` · ${r.contact}` : ""}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={r.paid} onChange={(e) => void run(() => api(`/api/events/${id}/registrations/${r.id}`, { method: "PATCH", ...jsonBody({ paid: e.target.checked }) }), "Could not update")} />Paid</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={r.attended} onChange={(e) => void run(() => api(`/api/events/${id}/registrations/${r.id}`, { method: "PATCH", ...jsonBody({ attended: e.target.checked }) }), "Could not update")} />Here</label>
                  <button onClick={() => void run(() => api(`/api/events/${id}/registrations/${r.id}`, { method: "DELETE" }), "Could not remove")} className="text-rose-700 underline">Remove</button>
                </span>
              </li>
            ))}
            {event.registrations.length === 0 ? <li className="text-slate-500">No registrations yet.</li> : null}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api(`/api/events/${id}/registrations`, { method: "POST", ...jsonBody({ name: regName, contact: regContact }) }), "Could not add").then((done) => { if (done) { setRegName(""); setRegContact(""); } });
            }}
          >
            <input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Name" required className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={regContact} onChange={(e) => setRegContact(e.target.value)} placeholder="Contact" className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <button className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">Add</button>
          </form>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-slate-600">Import CSV (name, contact, paid)</summary>
            <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs" />
            <button
              onClick={() => void run(() => api(`/api/events/${id}/registrations`, { method: "POST", ...jsonBody({ rows: parseRegistrationCsv(csv) }) }), "Import failed").then((done) => { if (done) setCsv(""); })}
              className="mt-1 rounded-xl border border-slate-200 px-3 py-1 text-xs"
            >
              Import
            </button>
          </details>
        </div>
      </div>
    </section>
  );
}
