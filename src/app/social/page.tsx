"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DashboardShell } from "@/components/dashboard-shell";

type Platform = "Instagram" | "LinkedIn" | "YouTube" | "X" | "Facebook";
type Status = "IDEA" | "DRAFT" | "SCHEDULED" | "POSTED";

type CalendarEntry = {
  id: string;
  title: string;
  script: string;
  platform: Platform;
  date: string;
  status: Status;
};

const PLATFORM_STYLES: Record<Platform, string> = {
  Instagram: "bg-pink-100 text-pink-800",
  LinkedIn:  "bg-blue-100  text-blue-800",
  YouTube:   "bg-red-100   text-red-800",
  X:         "bg-slate-100 text-slate-800",
  Facebook:  "bg-indigo-100 text-indigo-800",
};

const STATUS_STYLES: Record<Status, string> = {
  IDEA:      "bg-amber-50  text-amber-700  border-amber-200",
  DRAFT:     "bg-orange-50 text-orange-700 border-orange-200",
  SCHEDULED: "bg-cyan-50   text-cyan-700   border-cyan-200",
  POSTED:    "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_LABELS: Record<Status, string> = {
  IDEA: "Idea",
  DRAFT: "Shoot",
  SCHEDULED: "Scheduled",
  POSTED: "Posted",
};

function toDateKey(value: Date) {
  const y  = value.getFullYear();
  const m  = `${value.getMonth() + 1}`.padStart(2, "0");
  const d  = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const today = new Date();
const todayKey = toDateKey(today);

export default function SocialPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;

  const [selectedMonth,  setSelectedMonth]  = useState(defaultMonth);
  const [entries,        setEntries]        = useState<CalendarEntry[]>([]);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(todayKey);
  const [isLoading,      setIsLoading]      = useState(true);
  const [requestError,   setRequestError]   = useState<string | null>(null);

  // add-form state
  const [title,    setTitle]    = useState("");
  const [script,   setScript]   = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [date,     setDate]     = useState(todayKey);
  const [status,   setStatus]   = useState<Status>("IDEA");

  useEffect(() => {
    let isMounted = true;

    async function loadEntries() {
      setIsLoading(true);
      setRequestError(null);

      try {
        const response = await fetch("/api/social/entries", { cache: "no-store" });
        const payload = (await response.json()) as { data?: CalendarEntry[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load social entries");
        }

        if (isMounted) {
          setEntries(Array.isArray(payload.data) ? payload.data : []);
        }
      } catch (error) {
        if (isMounted) {
          setRequestError(error instanceof Error ? error.message : "Unable to load social entries");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadEntries();

    return () => {
      isMounted = false;
    };
  }, []);

  // calendar grid
  const { calendarCells, year, monthIndex } = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const daysInMonth  = new Date(y, m, 0).getDate();
    const totalCells   = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    const cells = Array.from({ length: totalCells }, (_, i) => {
      const dayNumber = i - firstWeekday + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return null;
      return { dayNumber, dateKey: toDateKey(new Date(y, m - 1, dayNumber)) };
    });

    return { calendarCells: cells, year: y, monthIndex: m - 1 };
  }, [selectedMonth]);

  const monthLabel = new Date(year, monthIndex, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  function prevMonth() {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`);
  }

  function nextMonth() {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setSelectedMonth(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`);
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !date) return;

    setRequestError(null);

    try {
      const response = await fetch("/api/social/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          script: script.trim(),
          platform,
          date,
          status,
        }),
      });

      const payload = (await response.json()) as { data?: CalendarEntry; error?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to create content entry");
      }

      const createdEntry = payload.data;
      setEntries((cur) => [...cur, createdEntry]);
      setTitle("");
      setScript("");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to create content entry");
    }
  }

  async function deleteEntry(id: string) {
    setRequestError(null);

    try {
      const response = await fetch(`/api/social/entries/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to delete content entry");
      }

      setEntries((cur) => cur.filter((e) => e.id !== id));
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to delete content entry");
    }
  }

  async function cycleStatus(id: string) {
    const order: Status[] = ["IDEA", "DRAFT", "SCHEDULED", "POSTED"];
    const target = entries.find((entry) => entry.id === id);

    if (!target) {
      return;
    }

    const nextStatus = order[(order.indexOf(target.status) + 1) % order.length];
    setRequestError(null);

    try {
      const response = await fetch(`/api/social/entries/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = (await response.json()) as { data?: CalendarEntry; error?: string };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Unable to update entry status");
      }

      setEntries((cur) => cur.map((entry) => (entry.id === id ? payload.data! : entry)));
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to update entry status");
    }
  }

  const selectedDayEntries = selectedDayKey ? entries.filter((e) => e.date === selectedDayKey) : [];
  const selectedDayLabel = selectedDayKey
    ? new Date(selectedDayKey + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : null;

  const upcoming = [...entries]
    .filter((e) => e.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  return (
    <DashboardShell title="Social Media Calendar" subtitle="Plan and track content across platforms — add script, platform, and publish date.">

      {/* ── Add-entry form ── */}
      <form
        onSubmit={handleAdd}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        {requestError ? (
          <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{requestError}</p>
        ) : null}
        <h3 className="mb-3 text-sm font-semibold text-slate-700">New Content Entry</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Content title (e.g. Founder Reel)"
            className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm lg:col-span-2"
          />
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          >
            <option>Instagram</option>
            <option>LinkedIn</option>
            <option>YouTube</option>
            <option>X</option>
            <option>Facebook</option>
          </select>
          <div className="flex gap-2">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="rounded-md border border-slate-300 bg-slate-50 px-2 py-2 text-sm"
            >
              <option value="IDEA">Idea</option>
              <option value="DRAFT">Shoot</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="POSTED">Posted</option>
            </select>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Script / copy notes (optional)"
            rows={2}
            className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm sm:col-span-2 lg:col-span-3"
          />
          <button
            type="submit"
            className="self-end rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add to Calendar
          </button>
        </div>
      </form>

      {/* ── Calendar grid ── */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {isLoading ? (
          <p className="mb-4 text-sm text-slate-500">Loading shared content...</p>
        ) : null}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={prevMonth} className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">‹</button>
            <h3 className="text-base font-semibold text-slate-900">{monthLabel}</h3>
            <button type="button" onClick={nextMonth} className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">›</button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedMonth(defaultMonth)}
            className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            Today
          </button>
        </div>

        {/* Day-name header */}
        <div className="grid grid-cols-7 rounded-t-lg overflow-hidden border border-slate-200">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="border-r border-slate-200 bg-slate-100 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 border-x border-b border-slate-200 rounded-b-lg overflow-hidden">
          {calendarCells.map((cell, i) => {
            const isToday    = cell?.dateKey === todayKey;
            const isSelected = cell?.dateKey === selectedDayKey;
            const dayEntries = cell ? entries.filter((e) => e.date === cell.dateKey) : [];
            return (
              <div
                key={`cell-${i}`}
                onClick={() => cell && setSelectedDayKey(isSelected ? null : cell.dateKey)}
                className={[
                  "min-h-28 border-r border-b border-slate-200 p-1.5 transition-colors",
                  "nth-[7n]:border-r-0",
                  cell ? "cursor-pointer" : "bg-slate-50/60",
                  cell && isSelected ? "bg-violet-50 ring-2 ring-inset ring-violet-400" :
                  cell && isToday   ? "bg-sky-50" :
                  cell              ? "hover:bg-slate-50" : "",
                ].join(" ")}
              >
                {cell ? (
                  <>
                    <span className={[
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isSelected ? "bg-violet-600 text-white" :
                      isToday    ? "bg-slate-900 text-white" : "text-slate-700",
                    ].join(" ")}>
                      {cell.dayNumber}
                    </span>

                    <div className="mt-1 space-y-1">
                      {dayEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className={[
                            "w-full min-w-0 overflow-hidden rounded border px-1 py-0.5 text-[10px] leading-tight",
                            STATUS_STYLES[entry.status],
                          ].join(" ")}
                        >
                          <span className={["block truncate rounded px-0.5 text-[9px] font-semibold leading-tight mb-0.5", PLATFORM_STYLES[entry.platform]].join(" ")}>
                            {entry.platform}
                          </span>
                          <span className="block truncate font-medium">{entry.title}</span>
                        </div>
                      ))}
                      {dayEntries.length === 0 && (
                        <span className="block text-[9px] text-slate-300 mt-1">No posts</span>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Day detail modal ── */}
      {selectedDayKey ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDayKey(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Panel */}
          <div
            className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-violet-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-violet-50 px-4 py-3 sticky top-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">Day View</p>
                <h4 className="text-base font-semibold text-slate-900">{selectedDayLabel}</h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayKey(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close day view"
              >
                ✕
              </button>
            </div>

            {selectedDayEntries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 italic">No content scheduled for this day.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {selectedDayEntries.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={["rounded px-2 py-0.5 text-[10px] font-semibold", PLATFORM_STYLES[entry.platform]].join(" ")}>
                          {entry.platform}
                        </span>
                        <button
                          type="button"
                          title="Click to advance status"
                          onClick={() => cycleStatus(entry.id)}
                          className={["rounded border px-2 py-0.5 text-[10px] font-medium cursor-pointer hover:opacity-70", STATUS_STYLES[entry.status]].join(" ")}
                        >
                          {STATUS_LABELS[entry.status]} →
                        </button>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                      {entry.script ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{entry.script}</p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400 italic">No script added.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteEntry(entry.id)}
                      className="shrink-0 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Upcoming list ── */}
      {upcoming.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Upcoming Content</h3>
          <div className="space-y-2">
            {upcoming.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-20 shrink-0 text-xs text-slate-500">{entry.date}</span>
                  <span className={["shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold", PLATFORM_STYLES[entry.platform]].join(" ")}>
                    {entry.platform}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-800">{entry.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={["rounded border px-2 py-0.5 text-[10px] font-medium", STATUS_STYLES[entry.status]].join(" ")}>
                    {STATUS_LABELS[entry.status]}
                  </span>
                  <button type="button" onClick={() => setSelectedDayKey(entry.date)} className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-white">
                    View
                  </button>
                  <button type="button" onClick={() => deleteEntry(entry.id)} className="rounded border border-rose-200 px-2 py-0.5 text-[10px] text-rose-600 hover:bg-rose-50">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
