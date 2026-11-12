export type Lifecycle = "PROSPECT" | "ONBOARDING" | "ACTIVE" | "MAINTENANCE" | "CLOSED";

export const lifecycleStages: Lifecycle[] = ["PROSPECT", "ONBOARDING", "ACTIVE", "MAINTENANCE", "CLOSED"];

export type Vertical = { id: string; name: string };

export type Company = {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  stateCode: string | null;
  address: string | null;
  verticalId: string | null;
  verticalName: string | null;
  website: string | null;
  lifecycle: Lifecycle;
  ownerId: string | null;
  source: string | null;
  referrer: string | null;
  notes: string | null;
  updatedAt: string;
  nextActionAt: string | null;
};

export type Contact = {
  id: string;
  companyId: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  whatsappRole: "CLIENT" | "CLIENT_TEAM" | null;
  onboarded: boolean;
  approved: boolean;
};

export type Interaction = {
  id: string;
  companyId: string;
  contactId: string | null;
  contactName: string | null;
  type: "CALL" | "MEETING" | "WHATSAPP" | "EMAIL" | "NOTE" | "SITE_VISIT";
  summary: string;
  at: string;
  nextAction: string | null;
  nextActionAt: string | null;
  nextActionDoneAt: string | null;
};

export type Meeting = {
  id: string;
  title: string;
  at: string;
  location: string | null;
  attendees: string[];
  notes: string | null;
};

export type FollowUp = {
  id: string;
  companyId: string;
  companyName: string;
  nextAction: string | null;
  nextActionAt: string;
  type: string;
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function isOverdue(value: string | null | undefined): boolean {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

/** For <input type="datetime-local"> -> ISO string, or undefined when empty. */
export function localToIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}
