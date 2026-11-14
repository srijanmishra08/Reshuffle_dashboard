import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  BankBlock, BrandStrip, ItemsTable, PartyBlock, SignatureBlock, TaxSummary, formatLongDate, styles,
} from "../parts";
import type { InvoiceSnapshot } from "../types";

export function InvoiceDocument({ data }: { data: InvoiceSnapshot }) {
  const s = data.seller;
  return (
    <Document title={`Invoice ${data.number}`}>
      <Page size="A4" style={styles.page}>
        <BrandStrip />
        <View style={styles.body}>
          <View style={[styles.between, { borderBottomWidth: 2, borderBottomColor: "#111111", paddingBottom: 10, marginBottom: 14 }]}>
            <Text style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>TAX INVOICE</Text>
            <View style={{ alignItems: "flex-end", maxWidth: 260 }}>
              <Text style={[styles.bold, styles.muted]}>Payment Terms:</Text>
              <Text style={styles.muted}>{data.paymentTerms || "N/A"}</Text>
            </View>
          </View>
          <View style={[styles.row, { gap: 20 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>From</Text>
              <Text style={[styles.bold, { fontSize: 10 }]}>{s.legalName}</Text>
              {s.signatoryName ? <Text>{s.signatoryName}</Text> : null}
              <Text>{s.address}</Text>
              {s.gstin ? <Text><Text style={styles.bold}>GSTIN:</Text> {s.gstin}</Text> : null}
            </View>
            <PartyBlock heading="To" buyer={data.buyer} />
          </View>
          <View style={[styles.row, { gap: 20, backgroundColor: "#f7f7f7", padding: "8 14", marginTop: 14 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Invoice No.</Text>
              <Text style={{ fontSize: 10 }}>{data.number}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Date</Text>
              <Text style={{ fontSize: 10 }}>{formatLongDate(data.issueDate)}</Text>
            </View>
          </View>
          <View style={{ marginTop: 14 }}>
            <Text style={styles.label}>Description of Services</Text>
          </View>
          <ItemsTable items={data.items} variant="invoice" />
          <TaxSummary tax={data} total={data.totalPaise} advancePaise={data.advancePaise} />
          <View style={[styles.row, { gap: 20, marginTop: 14, borderTopWidth: 1, borderTopColor: "#dddddd", paddingTop: 12 }]}>
            <View style={{ flex: 1 }}><BankBlock seller={data.seller} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Notes / Terms</Text>
              {data.notes ? <Text>{data.notes}</Text> : null}
              {data.terms ? <Text style={{ fontFamily: "Courier" }}>{data.terms}</Text> : null}
            </View>
          </View>
          <SignatureBlock seller={data.seller} />
        </View>
      </Page>
    </Document>
  );
}
