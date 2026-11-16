import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Money, Rupee, WordmarkHeader, formatDate, styles } from "../parts";
import type { SnapshotSeller } from "../types";

export type ScopePdfData = {
  number: string;
  version: number;
  sentOn: string;
  seller: SnapshotSeller;
  clientName: string | null;
  title: string;
  problemStatement: string;
  engagementModel: string | null;
  terms: string;
  totalPaise: number;
  timelineDays: number;
  paymentSchedule: { label: string; percent: number; amountPaise: number }[];
  items: { phase: string; title: string; description?: string | null; days: number; pricePaise: number }[];
};

const text = { fontSize: 10, lineHeight: 1.6, color: "#1a1a1a" } as const;
const muted = { fontSize: 8, color: "#555555", textTransform: "uppercase", letterSpacing: 0.5 } as const;
const heading = { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 6 } as const;
const rule = { borderBottomWidth: 0.5, borderBottomColor: "#cccccc" } as const;
const PAGE_TOP = 40;

/** Typed text can contain the rupee sign, which the body font lacks. */
function withRupee(value: string) {
  return value.split("₹").flatMap((part, i) => (i === 0 ? [part] : [<Rupee key={i} />, part]));
}

/** The scope a client is sent: problem, modules by phase, price, timeline, payment schedule and terms. */
export function ScopeDocument({ data }: { data: ScopePdfData }) {
  const phases = [...new Set(data.items.map((i) => i.phase))];
  const paragraphs = (value: string) => value.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <Document title={`Scope ${data.number}`}>
      <Page size="A4" style={[styles.page, { paddingTop: PAGE_TOP, paddingBottom: 36 }]}>
        <View style={{ marginTop: -PAGE_TOP }}>
          <WordmarkHeader seller={data.seller} />
        </View>
        <View style={{ paddingTop: 28, paddingHorizontal: 48 }}>
          <Text style={muted}>
            Scope of work · {data.number} · v{data.version} · {formatDate(data.sentOn)}
          </Text>
          <Text style={{ fontSize: 20, lineHeight: 1.3, fontWeight: 700, marginTop: 4 }}>{data.title}</Text>
          {data.clientName ? <Text style={[text, { marginTop: 2 }]}>Prepared for {data.clientName}</Text> : null}
          {data.engagementModel ? <Text style={[text, { color: "#555555" }]}>Engagement: {data.engagementModel}</Text> : null}

          {data.problemStatement.trim() ? (
            <View>
              <Text style={heading}>The problem</Text>
              {paragraphs(data.problemStatement).map((p, i) => (
                <Text key={i} style={[text, { marginBottom: 6 }]}>{withRupee(p)}</Text>
              ))}
            </View>
          ) : null}

          <Text style={heading}>What we will build</Text>
          {phases.map((phase) => (
            <View key={phase} style={{ marginBottom: 8 }}>
              <Text style={[muted, { marginBottom: 2 }]} minPresenceAhead={30}>{phase}</Text>
              {data.items
                .filter((i) => i.phase === phase)
                .map((item, i) => (
                  <View key={i} style={[styles.between, rule, { paddingVertical: 5 }]} wrap={false}>
                    <View style={{ width: "62%" }}>
                      <Text style={[text, styles.bold]}>{item.title}</Text>
                      {item.description ? <Text style={{ fontSize: 9, lineHeight: 1.5, color: "#444444" }}>{withRupee(item.description)}</Text> : null}
                    </View>
                    <Text style={[text, { width: "14%", textAlign: "right" }]}>{item.days} days</Text>
                    <Money paise={item.pricePaise} style={[text, { width: "24%", textAlign: "right" }]} />
                  </View>
                ))}
            </View>
          ))}

          <View style={[styles.between, { marginTop: 4 }]} wrap={false}>
            <Text style={[text, styles.bold]}>Total · {data.timelineDays} days</Text>
            <Money paise={data.totalPaise} style={{ fontSize: 13, fontWeight: 700 }} />
          </View>
          <Text style={{ fontSize: 8, color: "#555555", textAlign: "right" }}>GST extra as applicable</Text>

          {data.paymentSchedule.length ? (
            <View wrap={false}>
              <Text style={heading}>Payment schedule</Text>
              {data.paymentSchedule.map((step, i) => (
                <View key={i} style={[styles.between, rule, { paddingVertical: 4 }]}>
                  <Text style={[text, { width: "60%" }]}>{step.label}</Text>
                  <Text style={[text, { width: "14%", textAlign: "right" }]}>{step.percent}%</Text>
                  <Money paise={step.amountPaise} style={[text, { width: "26%", textAlign: "right" }]} />
                </View>
              ))}
            </View>
          ) : null}

          {data.terms.trim() ? (
            <View>
              <Text style={heading}>Terms</Text>
              {paragraphs(data.terms).map((p, i) => (
                <Text key={i} style={{ fontSize: 9, lineHeight: 1.6, color: "#333333", marginBottom: 5 }}>{withRupee(p)}</Text>
              ))}
            </View>
          ) : null}

          <View style={[styles.between, { marginTop: 30 }]} wrap={false}>
            {[data.seller.legalName, data.clientName ?? "Client"].map((name, i) => (
              <View key={i} style={{ width: "44%" }}>
                <View style={{ height: 30, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" }} />
                <Text style={[text, styles.bold, { marginTop: 4 }]}>{name}</Text>
                <Text style={{ fontSize: 9, color: "#555555" }}>Date: ________________</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
