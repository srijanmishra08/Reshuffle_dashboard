/* eslint-disable jsx-a11y/alt-text -- react-pdf Image is not an <img>; PDFs have no alt text */
import type { ComponentProps, ReactNode } from "react";
import path from "node:path";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";

import { amountInWords, formatINR } from "@/server/lib/money";
import { FONT, FONT_EXT } from "./fonts";
import type { SnapshotBuyer, SnapshotLine, SnapshotSeller, TaxSnapshot } from "./types";

export const styles = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 9, padding: 0, color: "#111111", lineHeight: 1.4 },
  body: { paddingTop: 20, paddingHorizontal: 32, paddingBottom: 24 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontWeight: 700 },
  muted: { color: "#444444" },
  title: { fontSize: 18, fontWeight: 700, lineHeight: 1.6, marginBottom: 2 },
  label: { fontSize: 7, color: "#888888", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 },
  box: { padding: 0 },
  th: { backgroundColor: "#111111", color: "#ffffff", fontWeight: 700, paddingVertical: 6, paddingHorizontal: 9, letterSpacing: 1 },
  td: { paddingVertical: 5, paddingHorizontal: 9, borderBottomWidth: 1, borderBottomColor: "#eeeeee" },
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

const LOGO_MARK = path.join(process.cwd(), "public/brand/logo-mark.png");
const LOGO_WORDMARK = path.join(process.cwd(), "public/brand/logo-wordmark.png");

/** Black header strip used on invoices, work orders and credit notes. `right` is shown at the far end. */
export function BrandStrip({ right }: { right?: ReactNode }) {
  return (
    <View style={{ backgroundColor: "#000000", paddingVertical: 12, paddingHorizontal: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Image src={LOGO_MARK} style={{ width: 40, height: 40, marginRight: 12 }} />
        <View>
          <Text style={{ color: "#ffffff", fontSize: 17, fontWeight: 700, letterSpacing: 2, lineHeight: 1.2 }}>RESHUFFLE</Text>
          <Text style={{ color: "#aaaaaa", fontSize: 7.5, letterSpacing: 1.5, marginTop: 4 }}>OPC PRIVATE LIMITED</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

export function Letterhead({ title, number, date }: {
  seller?: SnapshotSeller;
  title: string;
  number: string;
  date: string;
}) {
  return (
    <BrandStrip
      right={
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: 700, letterSpacing: 3 }}>{title}</Text>
          <Text style={{ color: "#aaaaaa", fontSize: 8, marginTop: 3 }}>NO&nbsp;&nbsp;{number}</Text>
          <Text style={{ color: "#aaaaaa", fontSize: 8 }}>DATE&nbsp;&nbsp;{formatDate(date)}</Text>
        </View>
      }
    />
  );
}

/** Wordmark banner plus contact bar, used on letters (offer letter, letterhead). */
export function WordmarkHeader({ seller }: { seller: SnapshotSeller }) {
  const left = [seller.gstin ? `GSTIN- ${seller.gstin}` : null, seller.phone].filter(Boolean) as string[];
  const right = [seller.email, seller.website].filter(Boolean) as string[];
  return (
    <View>
      <View style={{ backgroundColor: "#000000", paddingTop: 30, paddingBottom: 24, paddingHorizontal: 40 }}>
        <Image src={LOGO_WORDMARK} style={{ width: "100%" }} />
      </View>
      <View style={{ backgroundColor: "#000000", paddingVertical: 12, paddingHorizontal: 40, flexDirection: "row", justifyContent: "space-between" }}>
        <View>{left.map((t) => <Text key={t} style={{ color: "#ffffff", fontSize: 9, lineHeight: 1.7 }}>{t}</Text>)}</View>
        <View>{right.map((t) => <Text key={t} style={{ color: "#ffffff", fontSize: 9, lineHeight: 1.7, textAlign: "right" }}>{t}</Text>)}</View>
      </View>
    </View>
  );
}

export function PartyBlock({ heading, buyer, extra }: { heading: string; buyer: SnapshotBuyer; extra?: ReactNode }) {
  return (
    <View style={[styles.box, { flex: 1 }]}>
      <Text style={styles.label}>{heading}</Text>
      <Text style={[styles.bold, { fontSize: 10, marginBottom: 6 }]}>{buyer.name}</Text>
      {buyer.address ? <Text>{buyer.address}</Text> : null}
      {buyer.gstin ? <Text>GSTIN: {buyer.gstin}</Text> : <Text style={styles.muted}>Unregistered</Text>}
      {extra}
    </View>
  );
}

/** Invoice lines: "#", description, amount. Work-order lines: qty, description, taxed, unit price, total. */
export function ItemsTable({ items, variant = "invoice" }: { items: SnapshotLine[]; variant?: "invoice" | "workorder" }) {
  const wo = variant === "workorder";
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text style={[styles.th, { width: wo ? 36 : 40, textAlign: wo ? "center" : "left" }]}>{wo ? "QTY" : "#"}</Text>
        <Text style={[styles.th, { flex: 1 }]}>Description{wo ? "" : ""}</Text>
        {wo ? <Text style={[styles.th, { width: 44, textAlign: "center" }]}>Taxed</Text> : null}
        {wo ? <Text style={[styles.th, { width: 80, textAlign: "right" }]}>Unit Price</Text> : null}
        <Text style={[styles.th, { width: wo ? 80 : 110, textAlign: "right" }]}>{wo ? "Total" : "Amount (INR)"}</Text>
      </View>
      {items.map((item, i) => (
        <View key={item.position} style={styles.row} wrap={false}>
          <Text style={[styles.td, { width: wo ? 36 : 40, textAlign: wo ? "center" : "left" }]}>{wo ? item.quantity : i + 1}</Text>
          <Text style={[styles.td, { flex: 1 }]}>
            {item.description}
            {!wo && item.sacCode ? `  (SAC ${item.sacCode})` : ""}
          </Text>
          {wo ? <Text style={[styles.td, { width: 44, textAlign: "center" }]}>{item.taxable ? "Yes" : "No"}</Text> : null}
          {wo ? <Money paise={item.ratePaise} style={[styles.td, { width: 80, textAlign: "right" }]} /> : null}
          {wo ? (
            <Money paise={item.amountPaise} style={[styles.td, { width: 80, textAlign: "right" }]} />
          ) : (
            <Text style={[styles.td, { width: 110, textAlign: "right" }]}>
              {item.amountPaise % 100 === 0 ? item.amountPaise / 100 : (item.amountPaise / 100).toFixed(2)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function SummaryRow({ label, paise, bold }: { label: string; paise: number; bold?: boolean }) {
  return (
    <View style={[styles.between, { paddingVertical: 2, paddingHorizontal: 9 }]}>
      <Text style={bold ? styles.bold : undefined}>{label}</Text>
      <Money paise={paise} style={bold ? styles.bold : undefined} />
    </View>
  );
}

export function TaxSummary({ tax, total, advancePaise }: { tax: Omit<TaxSnapshot, "totalPaise">; total: number; advancePaise?: number }) {
  const rate = (tax.rateBps ?? 1800) / 100;
  const half = rate / 2;
  return (
    <View style={{ width: 240, alignSelf: "flex-end", marginTop: 8 }}>
      <SummaryRow label="Professional Fees" paise={tax.subtotalPaise} />
      {tax.taxMode === "INTER" ? (
        <SummaryRow label={`IGST @ ${rate}%`} paise={tax.igstPaise} />
      ) : (
        <>
          <SummaryRow label={`CGST @ ${half}%`} paise={tax.cgstPaise} />
          <SummaryRow label={`SGST @ ${half}%`} paise={tax.sgstPaise} />
        </>
      )}
      {tax.roundOffPaise !== 0 ? <SummaryRow label="Round off" paise={tax.roundOffPaise} /> : null}
      <View style={{ backgroundColor: "#111111", marginTop: 2, paddingHorizontal: 9, paddingVertical: 3 }}>
        <View style={styles.between}>
          <Text style={{ color: "#ffffff", fontWeight: 700 }}>Total Amount</Text>
          <Money paise={total} style={{ color: "#ffffff", fontWeight: 700 }} />
        </View>
      </View>
      {advancePaise !== undefined ? (
        <>
          <View style={[styles.between, { paddingVertical: 3, paddingHorizontal: 9 }]}>
            <Text style={{ color: "#2a7a2a", fontWeight: 700 }}>Advance Amount</Text>
            <Text>{advancePaise / 100}</Text>
          </View>
          <View style={[styles.between, { backgroundColor: "#f7f7f7", paddingVertical: 4, paddingHorizontal: 9 }]}>
            <Text style={[styles.bold, { width: 90 }]}>Balance on Completion</Text>
            <Money paise={total - advancePaise} style={styles.bold} />
          </View>
        </>
      ) : null}
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
  const rows: [string, string | undefined][] = [
    ["Account No", bank.accountNumber],
    ["Account Type", bank.accountType],
    ["Bank", bank.bankName],
    ["IFSC", bank.ifsc],
  ];
  return (
    <View wrap={false}>
      <Text style={styles.label}>Bank Details</Text>
      {bank.accountName ? <Text><Text style={styles.bold}>Name:</Text> {bank.accountName}</Text> : null}
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <View key={k} style={{ marginTop: 3 }}>
          <Text style={styles.bold}>{k}:</Text>
          <Text>{v}</Text>
        </View>
      ))}
    </View>
  );
}

export function Terms({ text }: { text: string | null | undefined }) {
  if (!text?.trim()) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Notes / Terms</Text>
      <Text>{text}</Text>
    </View>
  );
}

let signatureImage: Buffer | null = null;
/** The signature lives in private storage; the engine loads it once per render and hands it over here. */
export function setSignatureImage(buf: Buffer | null) {
  signatureImage = buf;
}

export function SignatureBlock({ seller }: { seller: SnapshotSeller }) {
  return (
    <View style={[styles.between, { marginTop: 24, borderTopWidth: 1, borderTopColor: "#dddddd", paddingTop: 10 }]} wrap={false}>
      <View style={{ justifyContent: "flex-end" }}>
        <Text style={[styles.muted, { color: "#888888" }]}>{seller.legalName}</Text>
        {seller.gstin ? <Text style={{ color: "#888888" }}>GSTIN: {seller.gstin}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end", width: 200 }}>
        {signatureImage ? <Image src={{ data: signatureImage, format: "png" }} style={{ height: 34, marginBottom: 4 }} /> : <View style={{ height: 30 }} />}
        <Text style={{ color: "#888888" }}>Authorised Signatory</Text>
        <Text style={{ color: "#888888" }}>{seller.signatoryName || ""}</Text>
      </View>
    </View>
  );
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** YYYY-MM-DD -> "6 May 2026", the style on the invoices already sent. */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${Number(d)} ${MONTH_NAMES[Number(m) - 1] ?? m} ${y}` : iso;
}

/** YYYY-MM-DD -> DD/MM/YYYY (Indian convention). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
