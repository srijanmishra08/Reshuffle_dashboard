import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Letterhead, SignatureBlock, styles } from "../parts";
import type { LetterSnapshot } from "../types";

export function LetterDocument({ data }: { data: LetterSnapshot }) {
  const paragraphs = data.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <Document title={`Letter ${data.number}`}>
      <Page size="A4" style={styles.page}>
        <Letterhead seller={data.seller} title="LETTER" number={data.number} date={data.issueDate} />
        <View style={styles.section}>
          <Text style={styles.label}>To</Text>
          <Text style={styles.bold}>{data.recipientName}</Text>
          {data.recipientAddress ? <Text style={styles.muted}>{data.recipientAddress}</Text> : null}
        </View>
        <View style={styles.section}>
          <Text style={[styles.bold, { fontSize: 11 }]}>Subject: {data.subject}</Text>
        </View>
        <View style={styles.section}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={{ marginBottom: 8, fontSize: 10, lineHeight: 1.6 }}>{p}</Text>
          ))}
        </View>
        <SignatureBlock seller={data.seller} />
      </Page>
    </Document>
  );
}
