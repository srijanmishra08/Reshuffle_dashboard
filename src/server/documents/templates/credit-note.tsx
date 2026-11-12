import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  AmountInWords, Letterhead, PartyBlock, SignatureBlock, TaxSummary, formatDate, styles,
} from "../parts";
import type { CreditNoteData } from "../types";

export function CreditNoteDocument({ data }: { data: CreditNoteData }) {
  return (
    <Document title={`Credit note ${data.number}`}>
      <Page size="A4" style={styles.page}>
        <Letterhead seller={data.seller} title="CREDIT NOTE" number={data.number} date={data.issueDate} />
        <View style={[styles.row, styles.section, { gap: 10 }]}>
          <PartyBlock heading="Issued to" buyer={data.buyer} />
          <View style={[styles.box, { flex: 1 }]}>
            <Text style={styles.label}>Against invoice</Text>
            <Text>{data.invoiceNumber}</Text>
            <Text>Dated {formatDate(data.invoiceDate)}</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Reason</Text>
          <Text>{data.reason}</Text>
        </View>
        <TaxSummary tax={data} total={data.amountPaise} />
        <AmountInWords paise={data.amountPaise} />
        <SignatureBlock seller={data.seller} />
      </Page>
    </Document>
  );
}
