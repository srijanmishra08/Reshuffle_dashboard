import { Document, Page, Text, View } from "@react-pdf/renderer";
import { AmountInWords, Letterhead, Money, SignatureBlock, styles } from "../parts";
import type { SalarySlipSnapshot } from "../types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function periodLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

function Lines({ heading, lines, total, totalLabel }: {
  heading: string;
  lines: { label: string; amountPaise: number }[];
  total: number;
  totalLabel: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.th, { fontSize: 8 }]}>{heading}</Text>
      {lines.length === 0 ? <Text style={[styles.td, styles.muted]}>None</Text> : null}
      {lines.map((l, i) => (
        <View key={i} style={[styles.between, styles.td]}>
          <Text>{l.label}</Text>
          <Money paise={l.amountPaise} />
        </View>
      ))}
      <View style={[styles.between, { padding: 4 }]}>
        <Text style={styles.bold}>{totalLabel}</Text>
        <Money paise={total} style={styles.bold} />
      </View>
    </View>
  );
}

export function SalarySlipDocument({ data }: { data: SalarySlipSnapshot }) {
  const e = data.employee;
  return (
    <Document title={`Salary slip ${data.number}`}>
      <Page size="A4" style={styles.page}>
        <Letterhead seller={data.seller} title="SALARY SLIP" number={data.number} date={data.issueDate} />
        <View style={[styles.section, styles.box]}>
          <View style={styles.between}>
            <View>
              <Text style={styles.label}>Employee</Text>
              <Text style={styles.bold}>{e.name}</Text>
              {e.role ? <Text style={styles.muted}>{e.role}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.label}>Pay period</Text>
              <Text style={styles.bold}>{periodLabel(data.payPeriod)}</Text>
            </View>
          </View>
          <View style={[styles.between, { marginTop: 8 }]}>
            <Text>PAN: {e.panMasked ?? "-"}</Text>
            <Text>Bank A/c: {e.bankAccountMasked ?? "-"}{e.bankIfsc ? ` (${e.bankIfsc})` : ""}</Text>
          </View>
        </View>
        <View style={[styles.section, styles.row, { gap: 12 }]}>
          <Lines heading="Earnings" lines={data.earnings} total={data.grossPaise} totalLabel="Gross" />
          <Lines heading="Deductions" lines={data.deductions} total={data.deductionsPaise} totalLabel="Total deductions" />
        </View>
        <View style={[styles.section, styles.between, styles.box]}>
          <Text style={[styles.bold, { fontSize: 11 }]}>Net pay</Text>
          <Money paise={data.netPaise} style={[styles.bold, { fontSize: 11 }]} />
        </View>
        <AmountInWords paise={data.netPaise} />
        <SignatureBlock seller={data.seller} />
        <Text style={[styles.muted, { marginTop: 24, fontSize: 7 }]}>
          This is a computer generated salary slip. PAN and bank account numbers are masked.
        </Text>
      </Page>
    </Document>
  );
}
