"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, jsonBody } from "@/lib/api";
import { portalTaskStatuses } from "@/lib/schemas/access";
import { taskStatusLabels, type TaskStatusName } from "@/lib/schemas/project-tasks";

const select = "rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900 disabled:opacity-50";

/**
 * Status (and, for an agency, who holds the task) for one task. A freelancer or agency may move a task
 * between To do, In progress and Client review; finished tasks are left to the team.
 */
export function TaskControls({
  taskId,
  status,
  area,
  assigneeId,
  members,
  readOnly = false,
}: {
  taskId: string;
  status: string;
  area: "freelancer" | "agency";
  assigneeId?: string | null;
  members?: { id: string; name: string }[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finished = status === "COMPLETED" || status === "INVOICED";
  const open = (portalTaskStatuses as readonly string[]).includes(status);

  async function change(body: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/portal/${area}/tasks/${taskId}`, { method: "PATCH", ...jsonBody(body) });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the task");
    } finally {
      setBusy(false);
    }
  }

  if (finished) return <span className="text-xs text-stone-500">Finished</span>;
  if (readOnly) return <span className="text-xs text-stone-500">Preview: read only</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Task status" className={select} disabled={busy} value={status} onChange={(e) => void change({ status: e.target.value })}>
        {!open ? <option value={status} disabled>{taskStatusLabels[status as TaskStatusName] ?? status}</option> : null}
        {portalTaskStatuses.map((s) => (
          <option key={s} value={s}>
            {taskStatusLabels[s]}
          </option>
        ))}
      </select>
      {area === "agency" && members && members.length > 1 ? (
        <select aria-label="Assigned to" className={select} disabled={busy} value={assigneeId ?? ""} onChange={(e) => void change({ assigneeId: e.target.value })}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : null}
      {error ? <span className="text-xs text-rose-600" role="alert">{error}</span> : null}
    </div>
  );
}
