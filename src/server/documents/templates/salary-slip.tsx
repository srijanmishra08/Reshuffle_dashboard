import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "../parts";
import type { SalarySlipSnapshot } from "../types";
import { Rupee } from "../parts";
import { formatINR } from "@/server/lib/money";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const INK = "#f4f4f4";
const DIM = "#9a9a9a";
const RULE = "#3a3a3a";

function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

function Amt({ paise, bold }: { paise: number; bold?: boolean }) {
  return (
    <Text style={{ color: INK, fontWeight: bold ? 700 : 400 }}>
      <Rupee />
      {formatINR(paise).replace(/^[^\d-]+/, "")}
    </Text>
  );
}

function Column({ heading, lines, total, totalLabel }: {
  heading: string;
  lines: { label: string; amountPaise: number }[];
  total: number;
  totalLabel: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: INK, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>{heading}</Text>
      <View style={[styles.between, { borderBottomWidth: 1, borderBottomColor: RULE, paddingBottom: 4 }]}>
        <Text style={{ color: DIM, fontSize: 7.5, letterSpacing: 1 }}>DESCRIPTION</Text>
        <Text style={{ color: DIM, fontSize: 7.5, letterSpacing: 1 }}>AMOUNT</Text>
      </View>
      {lines.map((l, i) => (
        <View key={i} style={[styles.between, { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: RULE }]}>
          <Text style={{ color: INK }}>{l.label}</Text>
          <Amt paise={l.amountPaise} />
        </View>
      ))}
      <View style={[styles.between, { paddingVertical: 6, backgroundColor: "#1c1c1f", paddingHorizontal: 4, marginTop: 4 }]}>
        <Text style={{ color: INK, fontWeight: 700 }}>{totalLabel}</Text>
        <Amt paise={total} bold />
      </View>
    </View>
  );
}

export function SalarySlipDocument({ data }: { data: SalarySlipSnapshot }) {
  const e = data.employee;
  const s = data.seller;
  const year = data.payPeriod.split("-")[0];
  return (
    <Document title={`Salary slip ${data.number}`}>
      <Page size="A4" style={[styles.page, { backgroundColor: "#0b0b0d", color: INK }]}>
        <View style={{ paddingTop: 40, paddingHorizontal: 48, flex: 1 }}>
          <View style={styles.between}>
            <Text style={{ color: INK, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{s.legalName.toUpperCase()}</Text>
            <Text style={{ color: INK, fontSize: 13, fontWeight: 700 }}>{year}</Text>
          </View>
          <View style={[styles.between, { marginTop: 22, alignItems: "flex-end" }]}>
            <Text style={{ color: INK, fontSize: 44, fontWeight: 700, letterSpacing: 2 }}>
              SALARY <Text style={{ fontWeight: 400, color: "#d8d8d8" }}>SLIP</Text>
            </Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: INK }}><Text style={styles.bold}>Pay Period:</Text> {periodLabel(data.payPeriod)}</Text>
              <Text style={{ color: INK }}><Text style={styles.bold}>No:</Text> {data.number}</Text>
            </View>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: RULE, marginVertical: 16 }} />
          <View style={styles.between}>
            <View>
              <Text style={{ color: INK }}><Text style={styles.bold}>Employee Name:</Text> {e.name}</Text>
              <Text style={{ color: INK, marginTop: 3 }}><Text style={styles.bold}>Pan:</Text> {e.panMasked ?? "-"}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: INK }}><Text style={styles.bold}>Role:</Text> {e.role || "-"}</Text>
            </View>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: RULE, marginVertical: 16 }} />
          <View style={[styles.row, { gap: 24 }]}>
            <Column heading="EARNINGS" lines={data.earnings} total={data.grossPaise} totalLabel="GROSS EARNINGS" />
            <Column heading="DEDUCTIONS" lines={data.deductions} total={data.deductionsPaise} totalLabel="TOTAL DEDUCTIONS" />
          </View>
          <View style={[styles.between, { marginTop: 24, borderTopWidth: 1, borderTopColor: RULE, paddingTop: 12 }]}>
            <Text style={{ color: INK, fontSize: 12 }}><Text style={styles.bold}>Net Pay:</Text> <Amt paise={data.netPaise} bold /></Text>
            <Text style={{ color: INK }}><Text style={styles.bold}>Bank:</Text> {e.bankIfsc ?? "-"}</Text>
            <Text style={{ color: INK }}><Text style={styles.bold}>Account No:</Text> {e.bankAccountMasked ?? "-"}</Text>
          </View>
        </View>
        <View style={{ backgroundColor: "#000000", paddingVertical: 14, paddingHorizontal: 48 }}>
          <View style={styles.between}>
            <View>
              {s.phone ? <Text style={{ color: INK, fontSize: 9, letterSpacing: 1 }}>CONTACT {s.phone}</Text> : null}
              {s.gstin ? <Text style={{ color: DIM, fontSize: 8 }}>GSTIN- {s.gstin}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {s.email ? <Text style={{ color: INK, fontSize: 9 }}>{s.email.toUpperCase()}</Text> : null}
              {s.website ? <Text style={{ color: DIM, fontSize: 8 }}>{s.website.toUpperCase()}</Text> : null}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
