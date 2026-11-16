import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Rupee, WordmarkHeader, formatDate, styles } from "../parts";
import type { LetterSnapshot } from "../types";

/** A letter whose subject starts with "Job Offer" uses the offer-letter layout of the old invoice site. */
export function isOfferLetter(subject: string): boolean {
  return /^job offer/i.test(subject.trim());
}

/** A letter whose subject starts with "Service Agreement" gets a title, bold section headings and two signature blocks. */
export function isServiceAgreement(subject: string): boolean {
  return /^service agreement/i.test(subject.trim());
}

/** A short single line such as "2. Scope of Work" is a section heading. */
export function isSectionHeading(paragraph: string): boolean {
  return /^\d+\. [^\n]{1,60}$/.test(paragraph);
}

/** Typed text can contain the rupee sign, which the body font lacks, so each one becomes its own run. */
function withRupee(text: string) {
  const parts = text.split("₹");
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<Rupee key={i} />, part]));
}

/** Top margin on pages after the first; the letterhead cancels it on page one. */
const PAGE_TOP = 40;

const bodyText = { fontSize: 11, lineHeight: 1.7, color: "#1a1a1a" } as const;

export function LetterDocument({ data }: { data: LetterSnapshot }) {
  const paragraphs = data.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const offer = isOfferLetter(data.subject);
  const addressLines = (data.recipientAddress ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const agreement = isServiceAgreement(data.subject);
  const signatureBlock = (name: string, role: string) => (
    <View style={{ width: "44%" }}>
      <View style={{ height: 34, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" }} />
      <Text style={[bodyText, styles.bold, { marginTop: 4 }]}>{name}</Text>
      <Text style={{ fontSize: 9, color: "#555555" }}>{role}</Text>
      <Text style={{ fontSize: 9, color: "#555555", marginTop: 6 }}>Date: ________________</Text>
    </View>
  );
  const signoff = agreement ? (
    <View style={[styles.between, { marginTop: 24 }]} wrap={false}>
      {signatureBlock(data.seller.legalName, "Service Provider")}
      {signatureBlock(data.recipientName, "Client")}
    </View>
  ) : (
    <View style={{ marginTop: 28, alignItems: offer ? "flex-start" : "flex-end" }} wrap={false}>
      <View style={{ height: 30 }} />
      <Text style={[bodyText, { textAlign: offer ? "left" : "right" }]}>{data.seller.signatoryName || ""}</Text>
      <Text style={[bodyText, { textAlign: offer ? "left" : "right" }]}>
        {offer ? data.seller.signatoryTitle || data.seller.legalName : data.seller.legalName}
      </Text>
    </View>
  );
  return (
    <Document title={`${offer ? "Offer letter" : agreement ? "Service agreement" : "Letter"} ${data.number}`}>
      <Page size="A4" style={[styles.page, { paddingTop: PAGE_TOP, paddingBottom: 36 }]}>
        <View style={{ marginTop: -PAGE_TOP }}>
          <WordmarkHeader seller={data.seller} />
        </View>
        <View style={{ paddingTop: 36, paddingHorizontal: 56, paddingBottom: 30 }}>
          {offer ? (
            <Text style={{ textAlign: "center", fontSize: 20, fontWeight: 700, letterSpacing: 1, marginBottom: 24 }}>JOB OFFER LETTER</Text>
          ) : null}
          {agreement ? (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ textAlign: "center", fontSize: 20, lineHeight: 1.3, fontWeight: 700, letterSpacing: 1 }}>SERVICE AGREEMENT</Text>
              <Text style={{ textAlign: "center", fontSize: 9, color: "#555555", marginTop: 6 }}>Agreement No. {data.number}</Text>
            </View>
          ) : null}
          <View style={styles.between}>
            <Text style={offer ? [bodyText, styles.bold] : bodyText}>{offer ? "To:" : `Date: ${formatDate(data.issueDate)}`}</Text>
            {offer ? <Text style={bodyText}>{formatDate(data.issueDate)}</Text> : null}
          </View>
          <View style={{ marginTop: 6, marginBottom: 18 }}>
            <Text style={bodyText}>{data.recipientName}</Text>
            {addressLines.map((l, i) => <Text key={i} style={bodyText}>{l}</Text>)}
          </View>
          {!offer && !agreement && data.subject ? (
            <Text style={[bodyText, styles.bold, { marginBottom: 10 }]}>Subject: {data.subject}</Text>
          ) : null}
          {paragraphs.map((p, i) => (
            <Text
              key={i}
              style={agreement && isSectionHeading(p) ? [bodyText, styles.bold, { fontSize: 12, marginTop: 6, marginBottom: 6 }] : [bodyText, { marginBottom: agreement ? 8 : 12 }]}
              minPresenceAhead={agreement && isSectionHeading(p) ? 40 : undefined}
            >
              {withRupee(p)}
            </Text>
          ))}
          {signoff}
        </View>
      </Page>
    </Document>
  );
}
