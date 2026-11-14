import { Document, Page, Text, View } from "@react-pdf/renderer";
import { WordmarkHeader, formatDate, styles } from "../parts";
import type { LetterSnapshot } from "../types";

/** A letter whose subject starts with "Job Offer" uses the offer-letter layout of the old invoice site. */
export function isOfferLetter(subject: string): boolean {
  return /^job offer/i.test(subject.trim());
}

const bodyText = { fontSize: 11, lineHeight: 1.7, color: "#1a1a1a" } as const;

export function LetterDocument({ data }: { data: LetterSnapshot }) {
  const paragraphs = data.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const offer = isOfferLetter(data.subject);
  const addressLines = (data.recipientAddress ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const signoff = (
    <View style={{ marginTop: 28, alignItems: offer ? "flex-start" : "flex-end" }} wrap={false}>
      <View style={{ height: 30 }} />
      <Text style={[bodyText, { textAlign: offer ? "left" : "right" }]}>{data.seller.signatoryName || ""}</Text>
      <Text style={[bodyText, { textAlign: offer ? "left" : "right" }]}>
        {offer ? data.seller.signatoryTitle || data.seller.legalName : data.seller.legalName}
      </Text>
    </View>
  );
  return (
    <Document title={`${offer ? "Offer letter" : "Letter"} ${data.number}`}>
      <Page size="A4" style={styles.page}>
        <WordmarkHeader seller={data.seller} />
        <View style={{ paddingTop: 36, paddingHorizontal: 56, paddingBottom: 30 }}>
          {offer ? (
            <Text style={{ textAlign: "center", fontSize: 20, fontWeight: 700, letterSpacing: 1, marginBottom: 24 }}>JOB OFFER LETTER</Text>
          ) : null}
          <View style={styles.between}>
            <Text style={offer ? [bodyText, styles.bold] : bodyText}>{offer ? "To:" : `Date: ${formatDate(data.issueDate)}`}</Text>
            {offer ? <Text style={bodyText}>{formatDate(data.issueDate)}</Text> : null}
          </View>
          <View style={{ marginTop: 6, marginBottom: 18 }}>
            <Text style={bodyText}>{data.recipientName}</Text>
            {addressLines.map((l, i) => <Text key={i} style={bodyText}>{l}</Text>)}
          </View>
          {!offer && data.subject ? (
            <Text style={[bodyText, styles.bold, { marginBottom: 10 }]}>Subject: {data.subject}</Text>
          ) : null}
          {paragraphs.map((p, i) => (
            <Text key={i} style={[bodyText, { marginBottom: 12 }]}>{p}</Text>
          ))}
          {signoff}
        </View>
      </Page>
    </Document>
  );
}
