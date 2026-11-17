import { z } from "zod";

/** What the invoice software sends about an invoice, so the dashboard can record it. Amounts are the numbers typed in the form. */
export const uploadedInvoiceDetailsSchema = z.object({
  clientName: z.string().trim().min(1).max(200),
  clientGstin: z.string().trim().max(20).default(""),
  clientAddress: z.string().trim().max(600).default(""),
  items: z
    .array(z.object({ description: z.string().trim().min(1).max(500), amount: z.string().trim().max(20) }))
    .min(1)
    .max(30),
  advance: z.string().trim().max(20).default(""),
  paymentTerms: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(2000).default(""),
});
export type UploadedInvoiceDetails = z.infer<typeof uploadedInvoiceDetailsSchema>;

/** Why an uploaded invoice was not recorded in the dashboard's invoices, and what to say about it. */
export const recordIssueMessages = {
  NO_DETAILS: "Sent without the invoice details, so it cannot be recorded automatically.",
  NO_NUMBER: "The invoice has no number.",
  NO_DATE: "The date on the invoice could not be read.",
  BAD_ITEMS: "A line item amount is missing or not a plain number.",
  NEW_CLIENT: "The client is not in the dashboard yet.",
  NUMBER_USED: "Another dashboard invoice already uses this number.",
  TOTAL_MISMATCH: "The total on the PDF does not match the total the dashboard works out from the line items.",
  NO_SETTINGS: "Set the organisation's state in Settings before invoices can be recorded.",
} as const;
export type RecordIssue = keyof typeof recordIssueMessages;
