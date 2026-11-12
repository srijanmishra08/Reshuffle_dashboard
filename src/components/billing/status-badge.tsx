import { statusStyles } from "@/lib/billing-types";

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? statusStyles.DRAFT}`}>
        {status.replace("_", " ")}
      </span>
      {overdue ? <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-medium text-white">Overdue</span> : null}
    </span>
  );
}
