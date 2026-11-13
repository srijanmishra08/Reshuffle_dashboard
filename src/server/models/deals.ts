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

export const dealStageLabels: Record<DealStage, string> = {
  LEAD: "Lead",
  CONTACTED: "Contacted",
  DIAGNOSED: "Diagnosed",
  PROPOSAL_SENT: "Proposal sent",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

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
