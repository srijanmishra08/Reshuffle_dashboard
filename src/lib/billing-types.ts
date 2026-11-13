/** Client-side shapes for the billing API. Money is integer paise; format with formatINR for display. */

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export type WorkOrderStatus = "DRAFT" | "ISSUED" | "COMPLETED" | "CANCELLED";

export const paymentMethods = ["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "CARD", "OTHER"] as const;

export type InvoiceListRow = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  companyId: string;
  companyName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalPaise: number;
  paidPaise: number;
  overdueAt: string | null;
};

export type Receivables = {
  outstandingPaise: number;
  openCount: number;
  overduePaise: number;
  overdueCount: number;
};

export type InvoiceItem = {
  id?: string;
  description: string;
  sacCode: string | null;
  quantity: number;
  ratePaise: number;
  amountPaise?: number;
  taxable: boolean;
};

export type InvoiceDetail = {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  companyId: string;
  companyName: string;
  issueDate: string | null;
  dueDate: string | null;
  placeOfSupply: string | null;
  taxMode: "INTRA" | "INTER" | string | null;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  notes: string | null;
  terms: string | null;
  isIssued: boolean;
  overdueAt: string | null;
  items: InvoiceItem[];
  payments: { id: string; amountPaise: number; paidAt: string; method: string; reference: string | null }[];
  creditNote: { id: string; number: string | null } | null;
};

export type WorkOrderListRow = {
  id: string;
  number: string | null;
  status: WorkOrderStatus;
  companyId: string;
  companyName: string | null;
  issueDate: string | null;
  completedDate: string | null;
  totalPaise: number;
};

/** Rupee text from a form field to integer paise, without float drift. */
export function rupeesToPaise(value: string): number {
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return NaN;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export const statusStyles: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  ISSUED: "bg-sky-100 text-sky-800",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-rose-100 text-rose-800",
};

export type WorkOrderDetail = {
  id: string;
  number: string | null;
  status: WorkOrderStatus;
  companyId: string;
  companyName: string;
  customerRef: string | null;
  requestedBy: string | null;
  department: string | null;
  jobDetails: string | null;
  comments: string | null;
  issueDate: string | null;
  completedDate: string | null;
  placeOfSupply: string | null;
  taxMode: "INTRA" | "INTER" | string | null;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  isIssued: boolean;
  items: InvoiceItem[];
};

export type LetterListRow = {
  id: string;
  number: string | null;
  status: "DRAFT" | "ISSUED";
  recipientName: string;
  subject: string;
  issueDate: string | null;
};

export type LetterDetail = LetterListRow & {
  companyId: string | null;
  recipientAddress: string | null;
  body: string;
  isIssued: boolean;
};
