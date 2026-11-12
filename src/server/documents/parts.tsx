import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";

import { amountInWords, formatINR } from "@/server/lib/money";
import { FONT, FONT_EXT } from "./fonts";
import type { SnapshotBuyer, SnapshotLine, SnapshotSeller, TaxSnapshot } from "./types";

export const styles = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 9, padding: 36, color: "#0f172a", lineHeight: 1.4 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontWeight: 700 },
  muted: { color: "#64748b" },
  title: { fontSize: 18, fontWeight: 700, lineHeight: 1.6, marginBottom: 2 },
  label: { fontSize: 7, color: "#64748b", textTransform: "uppercase", marginBottom: 2 },
  box: { borderWidth: 1, borderColor: "#cbd5e1", padding: 8 },
  th: { backgroundColor: "#f1f5f9", fontWeight: 700, padding: 4 },
  td: { padding: 4, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  section: { marginTop: 14 },
});

/** The rupee sign lives in a different font subset, so it gets its own run. */
export function Rupee() {
  return <Text style={{ fontFamily: FONT_EXT }}>₹</Text>;
}

export function Money({ paise, style }: { paise: number; style?: ComponentProps<typeof View>["style"] }) {
  return (
    <Text style={style}>
      <Rupee />
      {formatINR(paise).replace(/^[^\d-]+/, "")}
    </Text>
  );
}

export function Letterhead({ seller, title, number, date }: {
  seller: SnapshotSeller;
  title: string;
  number: string;
  date: string;
}) {
  return (
    <View style={[styles.between, { borderBottomWidth: 2, borderBottomColor: "#0f172a", paddingBottom: 8 }]}>
      <View style={{ maxWidth: 320 }}>
        <Text style={styles.title}>{seller.legalName}</Text>
        <Text style={styles.muted}>{seller.address}</Text>
        {seller.gstin ? <Text>GSTIN: {seller.gstin}</Text> : null}
        {seller.pan ? <Text>PAN: {seller.pan}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.bold, { fontSize: 13, lineHeight: 1.7 }]}>{title}</Text>
        <Text>No: {number}</Text>
        <Text>Date: {formatDate(date)}</Text>
      </View>
    </View>
  );
}

export function PartyBlock({ heading, buyer, extra }: { heading: string; buyer: SnapshotBuyer; extra?: ReactNode }) {
  return (
    <View style={[styles.box, { flex: 1 }]}>
      <Text style={styles.label}>{heading}</Text>
      <Text style={styles.bold}>{buyer.name}</Text>
      {buyer.address ? <Text>{buyer.address}</Text> : null}
      {buyer.gstin ? <Text>GSTIN: {buyer.gstin}</Text> : <Text style={styles.muted}>Unregistered</Text>}
      {buyer.stateCode ? <Text>State code: {buyer.stateCode}</Text> : null}
      {extra}
    </View>
  );
}

const cols = { n: 22, desc: 250, sac: 55, qty: 35, rate: 80, amt: 80 };

export function ItemsTable({ items, showTaxable = false }: { items: SnapshotLine[]; showTaxable?: boolean }) {
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text style={[styles.th, { width: cols.n }]}>#</Text>
        <Text style={[styles.th, { width: cols.desc }]}>Description</Text>
        <Text style={[styles.th, { width: cols.sac }]}>SAC</Text>
        <Text style={[styles.th, { width: cols.qty, textAlign: "right" }]}>Qty</Text>
        <Text style={[styles.th, { width: cols.rate, textAlign: "right" }]}>Rate</Text>
        <Text style={[styles.th, { width: cols.amt, textAlign: "right" }]}>Amount</Text>
      </View>
      {items.map((item, i) => (
        <View key={item.position} style={styles.row} wrap={false}>
          <Text style={[styles.td, { width: cols.n }]}>{i + 1}</Text>
          <Text style={[styles.td, { width: cols.desc }]}>
            {item.description}
            {showTaxable && !item.taxable ? " (not taxed)" : ""}
          </Text>
          <Text style={[styles.td, { width: cols.sac }]}>{item.sacCode ?? ""}</Text>
          <Text style={[styles.td, { width: cols.qty, textAlign: "right" }]}>{item.quantity}</Text>
          <Money paise={item.ratePaise} style={[styles.td, { width: cols.rate, textAlign: "right" }]} />
          <Money paise={item.amountPaise} style={[styles.td, { width: cols.amt, textAlign: "right" }]} />
        </View>
      ))}
    </View>
  );
}

function SummaryRow({ label, paise, bold }: { label: string; paise: number; bold?: boolean }) {
  return (
    <View style={[styles.between, { paddingVertical: 2 }]}>
      <Text style={bold ? styles.bold : undefined}>{label}</Text>
      <Money paise={paise} style={bold ? styles.bold : undefined} />
    </View>
  );
}

export function TaxSummary({ tax, total }: { tax: Omit<TaxSnapshot, "totalPaise">; total: number }) {
  const rate = (tax.rateBps ?? 1800) / 100;
  const half = rate / 2;
  return (
    <View style={{ width: 230, alignSelf: "flex-end", marginTop: 8 }}>
      <SummaryRow label="Subtotal" paise={tax.subtotalPaise} />
      {tax.taxMode === "INTER" ? (
        <SummaryRow label={`IGST @ ${rate}%`} paise={tax.igstPaise} />
      ) : (
        <>
          <SummaryRow label={`CGST @ ${half}%`} paise={tax.cgstPaise} />
          <SummaryRow label={`SGST @ ${half}%`} paise={tax.sgstPaise} />
        </>
      )}
      {tax.roundOffPaise !== 0 ? <SummaryRow label="Round off" paise={tax.roundOffPaise} /> : null}
      <View style={{ borderTopWidth: 1, borderTopColor: "#0f172a", marginTop: 2, paddingTop: 2 }}>
        <SummaryRow label="Total" paise={total} bold />
      </View>
    </View>
  );
}

export function AmountInWords({ paise }: { paise: number }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Amount in words</Text>
      <Text style={styles.bold}>{amountInWords(Math.max(0, paise))}</Text>
    </View>
  );
}

export function BankBlock({ seller }: { seller: SnapshotSeller }) {
  const bank = seller.bankDetails;
  if (!bank || !(bank.accountNumber || bank.bankName)) return null;
  return (
    <View style={[styles.box, { marginTop: 14 }]} wrap={false}>
      <Text style={styles.label}>Bank details</Text>
      {bank.accountName ? <Text>Account name: {bank.accountName}</Text> : null}
      {bank.accountNumber ? <Text>Account no: {bank.accountNumber}</Text> : null}
      {bank.ifsc ? <Text>IFSC: {bank.ifsc}</Text> : null}
      {bank.bankName ? <Text>Bank: {bank.bankName}</Text> : null}
    </View>
  );
}

export function Terms({ text }: { text: string | null | undefined }) {
  if (!text?.trim()) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Terms</Text>
      <Text>{text}</Text>
    </View>
  );
}

export function SignatureBlock({ seller }: { seller: SnapshotSeller }) {
  return (
    <View style={{ marginTop: 30, alignSelf: "flex-end", width: 200 }} wrap={false}>
      <Text style={{ textAlign: "right" }}>For {seller.legalName}</Text>
      <View style={{ height: 36 }} />
      <Text style={[styles.bold, { textAlign: "right" }]}>{seller.signatoryName || "Authorised signatory"}</Text>
      {seller.signatoryTitle ? <Text style={[styles.muted, { textAlign: "right" }]}>{seller.signatoryTitle}</Text> : null}
    </View>
  );
}

/** YYYY-MM-DD -> DD/MM/YYYY (Indian convention). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
