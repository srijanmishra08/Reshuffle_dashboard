import { z } from "zod";

export const dealStageValues = [
  "LEAD",
  "CONTACTED",
  "DIAGNOSED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
export type DealStage = (typeof dealStageValues)[number];

export const openDealStages = ["LEAD", "CONTACTED", "DIAGNOSED", "PROPOSAL_SENT", "NEGOTIATION"] as const;

/**
 * Labels follow the sales process: lead from a sales node, 1st meeting, 2nd meeting (business + budget),
 * strategy/budget/research summary sent, awaiting the client's confirmation mail, accepted (project starts).
 * The stored keys are unchanged so existing deals, history and the delivery hand-off keep working.
 */
export const dealStageLabels: Record<DealStage, string> = {
  LEAD: "New lead",
  CONTACTED: "1st meeting",
  DIAGNOSED: "2nd meeting · budget",
  PROPOSAL_SENT: "Strategy sent",
  NEGOTIATION: "Awaiting confirmation",
  WON: "Accepted",
  LOST: "Lost",
};

/** Who can bring us a lead: a sales node is one of these. */
export const salesNodeKindValues = ["SALES_STAFF", "FREELANCER", "AGENCY", "INDIVIDUAL"] as const;
export type SalesNodeKind = (typeof salesNodeKindValues)[number];
export const salesNodeKindLabels: Record<SalesNodeKind, string> = {
  SALES_STAFF: "Sales staff",
  FREELANCER: "Freelancer",
  AGENCY: "Agency",
  INDIVIDUAL: "Individual referral",
};

/** The kinds of sales node that can bring us a lead. */
export const leadSourceValues = ["Sales staff", "Freelancer", "Agency", "Individual referral", "Direct / other"] as const;

/** Stage rules as config: any stage may move one step forward or back among open stages, any open stage may be LOST, LOST may reopen to LEAD. */
export function canTransitionDeal(from: DealStage, to: DealStage): boolean {
  if (from === to) return false;
  if (from === "WON") return false;
  if (from === "LOST") return to === "LEAD";
  if (to === "LOST") return true;
  if (to === "WON") return from === "NEGOTIATION" || from === "PROPOSAL_SENT";
  const open: readonly DealStage[] = openDealStages;
  return open.includes(to);
}

export const bucketValues = [
  "REVENUE",
  "MARKETING",
  "OPERATIONS",
  "CUSTOMER_EXPERIENCE",
  "MANAGEMENT",
] as const;
export type DiagnosisBucket = (typeof bucketValues)[number];

export const quotationStatusValues = ["NONE", "DRAFTED", "SENT", "ACCEPTED", "REJECTED"] as const;
export const temperatureValues = ["COLD", "WARM", "HOT"] as const;

export const dealStageSchema = z.enum(dealStageValues);
