import { redirect } from "next/navigation";

/** Old address: the saved PDFs now live on the Invoices page. */
export default function InvoicePdfsPage() {
  redirect("/invoices?tab=pdfs");
}
