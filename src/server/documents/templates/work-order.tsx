import { Document, Page, Text, View } from "@react-pdf/renderer";
import { AmountInWords, ItemsTable, Letterhead, PartyBlock, TaxSummary, styles } from "../parts";
import type { WorkOrderSnapshot } from "../types";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Text>{value || "-"}</Text>
    </View>
  );
}

export function WorkOrderDocument({ data }: { data: WorkOrderSnapshot }) {
  const s = data.seller;
  const bank = s.bankDetails;
  return (
    <Document title={`Work order ${data.number}`}>
      <Page size="A4" style={styles.page}>
        <Letterhead title="WORK ORDER" number={data.number} date={data.issueDate} />
        <View style={styles.body}>
          <View style={[styles.row, { gap: 12, backgroundColor: "#f7f7f7", padding: "8 14" }]}>
            <Field label="Requested By" value={data.requestedBy} />
            <Field label="Customer ID" value={data.customerRef} />
            <Field label="Department / Project" value={data.department} />
          </View>
          <View style={[styles.row, { gap: 20, marginTop: 14 }]}>
            <PartyBlock heading="Bill To" buyer={data.buyer} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Job Details</Text>
              <Text>{data.jobDetails || ""}</Text>
            </View>
          </View>
          <View style={{ marginTop: 14 }}><Text style={styles.label}>Line Items</Text></View>
          <ItemsTable items={data.items} variant="workorder" />
          <View style={[styles.row, { gap: 20, marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Comments / Terms</Text>
              <Text>{data.comments || ""}</Text>
            </View>
            <View>
              <TaxSummary tax={data} total={data.totalPaise} />
              <Text style={{ fontSize: 7.5, color: "#888888", textAlign: "right", marginTop: 6 }}>Make cheques payable to</Text>
              <Text style={[styles.bold, { textAlign: "right" }]}>{s.legalName}</Text>
            </View>
          </View>
          <AmountInWords paise={data.totalPaise} />
          <View style={[styles.between, { marginTop: 26 }]} wrap={false}>
            <View style={{ width: 250 }}>
              <Text style={styles.bold}>I agree that all work has been performed to my satisfaction.</Text>
              <View style={[styles.between, { marginTop: 26, borderTopWidth: 1, borderTopColor: "#111111", paddingTop: 3 }]}>
                <Text style={styles.muted}>Signature</Text>
                <Text style={styles.muted}>Date</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ height: 26 }} />
              <Text style={[styles.bold, styles.muted]}>Authorised Signatory{s.signatoryName ? ` - ${s.signatoryName}` : ""}</Text>
            </View>
          </View>
          <View style={[styles.between, { marginTop: 22, borderTopWidth: 1, borderTopColor: "#dddddd", paddingTop: 8 }]} wrap={false}>
            <View>
              <Text style={styles.muted}>{s.legalName}{s.address ? `  |  ${s.address}` : ""}</Text>
              <Text style={styles.muted}>
                {[s.gstin ? `GSTIN: ${s.gstin}` : "", bank?.bankName && bank?.accountNumber ? `${bank.bankName}: ${bank.accountNumber}` : "", bank?.ifsc ? `IFSC: ${bank.ifsc}` : ""].filter(Boolean).join("  |  ")}
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
