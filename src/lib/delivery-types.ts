/** Client-side shapes for the delivery projects API. Money is integer paise. */
export const deliveryStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type DeliveryStatusValue = (typeof deliveryStatuses)[number];

export type DeliveryProjectRow = {
  id: string;
  name: string;
  status: DeliveryStatusValue;
  companyId: string;
  companyName: string;
  budgetPaise: number;
  dueDate: string | null;
};

export type MilestoneRow = {
  id: string;
  position: number;
  label: string;
  percent: number;
  amountPaise: number;
  dueDate: string | null;
  status: "PENDING" | "DONE" | "INVOICED";
  invoiceId: string | null;
  completedAt: string | null;
};

export type DeliveryProjectDetail = Omit<DeliveryProjectRow, "companyName" | "dueDate"> & {
  dealId: string | null;
  scopeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  milestones: MilestoneRow[];
  invoicedPaise: number;
  paidPaise: number;
};

export const projectStatusStyles: Record<string, string> = {
  PLANNED: "bg-slate-100 text-slate-700",
  ACTIVE: "bg-sky-100 text-sky-800",
  ON_HOLD: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-rose-100 text-rose-800",
  PENDING: "bg-slate-100 text-slate-700",
  DONE: "bg-emerald-100 text-emerald-800",
  INVOICED: "bg-sky-100 text-sky-800",
};
