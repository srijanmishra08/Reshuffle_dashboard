/** Shapes of the frozen `snapshot_json` written at issue time. All money is integer paise. */
export type SnapshotLine = {
  position: number;
  description: string;
  sacCode: string | null;
  quantity: number;
  ratePaise: number;
  amountPaise: number;
  taxable: boolean;
};

export type SnapshotSeller = {
  legalName: string;
  address: string;
  stateCode: string;
  gstin: string;
  pan?: string;
  bankDetails?: { accountName?: string; accountNumber?: string; ifsc?: string; bankName?: string };
  signatoryName?: string;
  signatoryTitle?: string;
};

export type SnapshotBuyer = {
  name: string;
  address: string | null;
  gstin: string | null;
  stateCode: string | null;
};

export type TaxSnapshot = {
  taxMode: string;
  rateBps?: number;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
};

export type InvoiceSnapshot = TaxSnapshot & {
  type: "INVOICE";
  number: string;
  fy: string;
  issueDate: string;
  dueDate: string;
  seller: SnapshotSeller;
  buyer: SnapshotBuyer;
  placeOfSupply: string;
  items: SnapshotLine[];
  notes: string | null;
  terms: string | null;
};

export type WorkOrderSnapshot = TaxSnapshot & {
  type: "WORK_ORDER";
  number: string;
  fy: string;
  issueDate: string;
  seller: SnapshotSeller;
  buyer: SnapshotBuyer;
  customerRef: string | null;
  requestedBy: string | null;
  department: string | null;
  jobDetails: string | null;
  comments: string | null;
  placeOfSupply: string;
  items: SnapshotLine[];
};

export type CreditNoteData = {
  type: "CREDIT_NOTE";
  number: string;
  issueDate: string;
  reason: string;
  amountPaise: number;
  invoiceNumber: string;
  invoiceDate: string;
  seller: SnapshotSeller;
  buyer: SnapshotBuyer;
  taxMode: string;
  rateBps?: number;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
};

export type DocumentData = InvoiceSnapshot | WorkOrderSnapshot | CreditNoteData;
