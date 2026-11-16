import type { DiagnosisBucket } from "@/server/models/deals";

export type DiagnosisQuestion = { level: number; bucket: DiagnosisBucket; question: string };

export const diagnosisLevels: { level: number; name: string }[] = [
  { level: 1, name: "Business overview" },
  { level: 2, name: "Sales" },
  { level: 3, name: "Marketing" },
  { level: 4, name: "Operations" },
  { level: 5, name: "Customer experience" },
  { level: 6, name: "Finance" },
  { level: 7, name: "Management" },
  { level: 8, name: "Growth" },
];

export const bucketLabels: Record<DiagnosisBucket, string> = {
  REVENUE: "Revenue",
  MARKETING: "Marketing",
  OPERATIONS: "Operations",
  CUSTOMER_EXPERIENCE: "Customer experience",
  MANAGEMENT: "Management",
};

export const engagementModels = [
  "Problem Diagnosis",
  "Done For You",
  "Dedicated Team",
  "AI + Human Ops",
] as const;

/** The discovery call: 8 levels, each answer scored 0-5 for pain and rolled up into 5 buckets. */
export const diagnosisQuestions: DiagnosisQuestion[] = [
  { level: 1, bucket: "MANAGEMENT", question: "What does your company do?" },
  { level: 1, bucket: "MANAGEMENT", question: "What is your biggest challenge right now?" },
  { level: 2, bucket: "REVENUE", question: "How do new customers find you?" },
  { level: 2, bucket: "REVENUE", question: "How many leads do you receive every month?" },
  { level: 2, bucket: "REVENUE", question: "What happens after a lead comes in?" },
  { level: 2, bucket: "REVENUE", question: "How many leads become paying customers?" },
  { level: 3, bucket: "MARKETING", question: "How do you currently market your business?" },
  { level: 3, bucket: "MARKETING", question: "Which channel gives the best customers?" },
  { level: 3, bucket: "MARKETING", question: "What marketing activities are you doing consistently?" },
  { level: 3, bucket: "MARKETING", question: "What happens after someone visits your website?" },
  { level: 4, bucket: "OPERATIONS", question: "What consumes the most time in your business?" },
  { level: 4, bucket: "OPERATIONS", question: "What repetitive tasks do employees hate doing?" },
  { level: 4, bucket: "OPERATIONS", question: "Which process breaks most often?" },
  { level: 4, bucket: "OPERATIONS", question: "What information do you wish you could see instantly?" },
  { level: 5, bucket: "CUSTOMER_EXPERIENCE", question: "What do customers complain about most?" },
  { level: 5, bucket: "CUSTOMER_EXPERIENCE", question: "How quickly do you respond to inquiries?" },
  { level: 5, bucket: "CUSTOMER_EXPERIENCE", question: "Do customers ask for status updates frequently?" },
  { level: 6, bucket: "REVENUE", question: "What numbers do you check every week?" },
  { level: 6, bucket: "REVENUE", question: "Which expenses are increasing?" },
  { level: 6, bucket: "OPERATIONS", question: "What would happen if business doubled next month?" },
  { level: 6, bucket: "MANAGEMENT", question: "What financial reports take longest to create?" },
  { level: 7, bucket: "MANAGEMENT", question: "If you disappeared for 30 days, would the business run smoothly?" },
  { level: 7, bucket: "MANAGEMENT", question: "What decisions are hardest to make?" },
  { level: 7, bucket: "MANAGEMENT", question: "Which department causes the most headaches?" },
  { level: 8, bucket: "REVENUE", question: "What is stopping you from growing faster?" },
];
