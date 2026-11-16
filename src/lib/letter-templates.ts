/**
 * Starting text for the two documents that used to live outside the dashboard:
 * the job offer letter (old invoice site) and the service agreement (tools page).
 * Each builder returns a subject and body for an ordinary letter draft, so the
 * result is saved, numbered, frozen and printed by the existing letters flow.
 */

export type LetterDraftText = { subject: string; body: string };

const rupees = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

/** `2026-07-05` becomes `5 July 2026`. Anything else comes back unchanged. */
export function longDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

export type OfferLetterFields = {
  candidateName: string;
  position: string;
  startDate: string;
  employmentType: string;
  responsibilities: string;
  reportsTo: string;
  monthlyPayRupees: number;
};

export function offerLetterText(f: OfferLetterFields): LetterDraftText {
  const duties = f.responsibilities.trim().replace(/\.$/, "");
  const role = [
    `In this ${f.employmentType.trim() || "full-time"} role`,
    duties ? `, you will ${duties}` : "",
    f.reportsTo.trim() ? `, reporting to ${f.reportsTo.trim()}` : "",
    ".",
  ].join("");
  return {
    subject: `Job Offer: ${f.position.trim()}`,
    body: [
      `Dear ${f.candidateName.trim()},`,
      `We are pleased to offer you the position of ${f.position.trim()} at Reshuffle, starting ${longDate(f.startDate)}. Your skills and experience will be a valuable asset to our team.`,
      role,
      `Your monthly compensation will be ${rupees(f.monthlyPayRupees)}, along with benefits as per our company policies.`,
      "We look forward to welcoming you and supporting your growth at Reshuffle.",
      "Sincerely,",
    ].join("\n\n"),
  };
}

export const ipOptions = {
  full: "Upon receipt of full payment, all intellectual property rights in the deliverables, including copyrights and trademarks, shall be transferred in full to the Client.",
  licensed:
    "The Service Provider grants the Client a non-exclusive, perpetual licence to use the deliverables for the purposes outlined in this agreement. The Service Provider retains ownership of the work.",
  shared:
    "Both parties shall share equal ownership of the intellectual property created under this agreement. Neither party may license or sell the work to third parties without written consent from the other party.",
} as const;
export type IpOption = keyof typeof ipOptions;

export type AgreementInstalment = { label: string; percent: number };

export type ServiceAgreementFields = {
  providerName: string;
  clientName: string;
  projectTitle: string;
  description: string;
  deliverables: string;
  exclusions: string;
  startDate: string;
  endDate: string;
  totalFeeRupees: number;
  /** Fee excludes GST when true. */
  gstExtra: boolean;
  instalments: AgreementInstalment[];
  /** Number of revision rounds; 0 means unlimited. */
  revisionRounds: number;
  ip: IpOption;
  lateFeePercent: number;
  cancellationFeePercent: number;
  jurisdiction: string;
  extraClauses: string;
};

export function instalmentTotal(instalments: AgreementInstalment[]): number {
  return instalments.reduce((sum, i) => sum + (Number.isFinite(i.percent) ? i.percent : 0), 0);
}

export function serviceAgreementText(f: ServiceAgreementFields): LetterDraftText {
  const bullet = (text: string) => lines(text).map((l) => `•  ${l}`).join("\n");
  const fee = `${rupees(f.totalFeeRupees)}${f.gstExtra ? " plus GST as applicable" : ", inclusive of taxes"}`;
  const schedule = f.instalments
    .filter((i) => i.percent > 0)
    .map((i) => `•  ${i.label.trim() || "Instalment"}: ${i.percent}% (${rupees((f.totalFeeRupees * i.percent) / 100)})`)
    .join("\n");

  const terms: string[] = [
    f.revisionRounds > 0
      ? `Revisions. The Client is entitled to ${f.revisionRounds} round(s) of revisions within the project scope. Further revisions may be charged as agreed by both parties.`
      : "Revisions. The Client is entitled to unlimited rounds of revisions within the project scope.",
    `Intellectual Property. ${ipOptions[f.ip]}`,
    "Confidentiality. Each party shall keep the other party's business, technical and financial information confidential and use it only for this project.",
    "Termination. Either party may end this agreement with 14 days' written notice. Work completed up to the date of termination shall be paid for.",
  ];
  if (f.lateFeePercent > 0) terms.push(`Late Payment. A late fee of ${f.lateFeePercent}% per month applies to overdue invoices.`);
  if (f.cancellationFeePercent > 0) {
    terms.push(`Cancellation. If the Client cancels the project, a cancellation fee of ${f.cancellationFeePercent}% of the total project fee is due.`);
  }
  if (f.jurisdiction.trim()) {
    terms.push(`Governing Law. This agreement is governed by the laws of India and the courts at ${f.jurisdiction.trim()} have jurisdiction.`);
  }
  for (const clause of lines(f.extraClauses)) terms.push(clause);

  const sections = [
    "1. Parties",
    `This Service Agreement is entered into as of ${longDate(f.startDate)} between ${f.providerName.trim()} ("Service Provider") and ${f.clientName.trim()} ("Client").`,
    "2. Scope of Work",
    `Project: ${f.projectTitle.trim()}`,
    f.description.trim(),
    `Deliverables\n${bullet(f.deliverables) || "•  As agreed by both parties."}`,
    lines(f.exclusions).length ? `Not included\n${bullet(f.exclusions)}` : "",
    "3. Timeline",
    `Start date: ${longDate(f.startDate)}\nEnd date: ${longDate(f.endDate)}`,
    "4. Payment Terms",
    `Total project fee: ${fee}.`,
    schedule ? `Payment schedule\n${schedule}` : "",
    "5. Terms and Conditions",
    ...terms.map((t, i) => `5.${i + 1}  ${t}`),
    "6. Agreement",
    "By signing below, both parties confirm that they have read, understood and agree to the terms of this Service Agreement.",
  ];
  return {
    subject: `Service Agreement: ${f.projectTitle.trim()}`,
    body: sections.filter(Boolean).join("\n\n"),
  };
}
