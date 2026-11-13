export type LedgerKind = "INCOME" | "EXPENSE";

export type LedgerRow = {
  id: string;
  kind: LedgerKind;
  entryDate: string;
  amountPaise: number;
  categoryId: string | null;
  description: string;
  sourceType: "MANUAL" | "PAYMENT" | "PAYOUT";
};

export type Category = { id: string; name: string };

export type MonthlyRow = { month: string; incomePaise: number; expensePaise: number; netPaise: number };
export type MonthlySummary = { fy: number; months: MonthlyRow[]; incomePaise: number; expensePaise: number };

export type AgingBucket = { bucket: string; count: number; outstandingPaise: number };
export type AgingInvoice = {
  id: string;
  number: string | null;
  companyName: string;
  dueDate: string | null;
  outstandingPaise: number;
  daysPastDue: number;
  bucket: string;
};
export type Aging = { asOf: string; buckets: AgingBucket[]; totalOutstandingPaise: number; invoices: AgingInvoice[] };

export type GstMonth = {
  month: string;
  invoiceCount: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  invoiceValuePaise: number;
};
export type GstB2bRow = {
  invoiceId: string;
  number: string;
  issueDate: string;
  companyName: string;
  gstin: string | null;
  invoiceValuePaise: number;
};
export type GstReport = {
  fy: number;
  months: GstMonth[];
  totals: { taxableValuePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number };
  b2b: GstB2bRow[];
  b2c: GstB2bRow[];
};
