import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  AmountInWords, BankBlock, ItemsTable, Letterhead, PartyBlock, SignatureBlock, TaxSummary, Terms, formatDate, styles,
} from "../parts";
import type { InvoiceSnapshot } from "../types";

export function InvoiceDocument({ data }: { data: InvoiceSnapshot }) {
  return (
    <Document title={`Invoice ${data.number}`}>
      <Page size="A4" style={styles.page}>
        <Letterhead seller={data.seller} title="TAX INVOICE" number={data.number} date={data.issueDate} />
        <View style={[styles.row, styles.section, { gap: 10 }]}>
          <PartyBlock heading="Billed to" buyer={data.buyer} />
          <View style={[styles.box, { flex: 1 }]}>
            <Text style={styles.label}>Details</Text>
            <Text>Due date: {formatDate(data.dueDate)}</Text>
            <Text>Place of supply: {data.placeOfSupply || "-"}</Text>
            <Text>Financial year: {data.fy}</Text>
          </View>
        </View>
        <ItemsTable items={data.items} showTaxable />
        <TaxSummary tax={data} total={data.totalPaise} />
        <AmountInWords paise={data.totalPaise} />
        {data.notes ? (
          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}
        <BankBlock seller={data.seller} />
        <Terms text={data.terms} />
        <SignatureBlock seller={data.seller} />
      </Page>
    </Document>
  );
}
