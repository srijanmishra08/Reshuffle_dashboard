import { Document, Page, Text, View } from "@react-pdf/renderer";
import {
  AmountInWords, ItemsTable, Letterhead, PartyBlock, SignatureBlock, TaxSummary, styles,
} from "../parts";
import type { WorkOrderSnapshot } from "../types";

export function WorkOrderDocument({ data }: { data: WorkOrderSnapshot }) {
  return (
    <Document title={`Work order ${data.number}`}>
      <Page size="A4" style={styles.page}>
        <Letterhead seller={data.seller} title="WORK ORDER" number={data.number} date={data.issueDate} />
        <View style={[styles.row, styles.section, { gap: 10 }]}>
          <PartyBlock heading="Customer" buyer={data.buyer} />
          <View style={[styles.box, { flex: 1 }]}>
            <Text style={styles.label}>Request</Text>
            <Text>Customer ID: {data.customerRef || "-"}</Text>
            <Text>Requested by: {data.requestedBy || "-"}</Text>
            <Text>Department: {data.department || "-"}</Text>
          </View>
        </View>
        {data.jobDetails ? (
          <View style={styles.section}>
            <Text style={styles.label}>Job details</Text>
            <Text>{data.jobDetails}</Text>
          </View>
        ) : null}
        <ItemsTable items={data.items} showTaxable />
        <TaxSummary tax={data} total={data.totalPaise} />
        <AmountInWords paise={data.totalPaise} />
        {data.comments ? (
          <View style={styles.section}>
            <Text style={styles.label}>Comments</Text>
            <Text>{data.comments}</Text>
          </View>
        ) : null}
        <SignatureBlock seller={data.seller} />
      </Page>
    </Document>
  );
}
