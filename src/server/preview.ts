import type { AuthedUser } from "@/server/session-user";

/**
 * Preview lets an admin see the client, freelancer and partner agency portals as those people see them.
 * It reads a separate demo organisation, so no real record is ever shown or changed, and it only
 * applies to a signed-in admin. Real accounts are not touched and no email is added to the allowlist.
 */
export const DEMO_ORG = "demo";
export const PREVIEW_COOKIE = "rs_preview";
export const PREVIEW_HOURS = 2;

export const DEMO_IDS = {
  company: "demo-client",
  freelancer: "demo-freelancer",
  freelancer2: "demo-freelancer-2",
  agency: "demo-agency",
  project: "demo-project",
} as const;

export const previewRoles = ["CLIENT", "FREELANCER", "AGENCY"] as const;
export type PreviewRole = (typeof previewRoles)[number];

export const isPreviewRole = (value: unknown): value is PreviewRole => typeof value === "string" && (previewRoles as readonly string[]).includes(value);

/** What the preview cookie holds: a role alone for the demo data, or `ROLE:recordId` for a real client, freelancer or agency. */
export type PreviewChoice = { role: PreviewRole; recordId: string | null };

export function parsePreviewChoice(value: unknown): PreviewChoice | null {
  if (typeof value !== "string") return null;
  const [role, ...rest] = value.split(":");
  if (!isPreviewRole(role)) return null;
  const recordId = rest.join(":");
  if (rest.length > 0 && (recordId.length === 0 || recordId.length > 100)) return null;
  return { role, recordId: recordId || null };
}

export const formatPreviewChoice = (choice: PreviewChoice) => (choice.recordId ? `${choice.role}:${choice.recordId}` : choice.role);

/**
 * The admin, acting as one outside role. With no record it is the demo organisation and everything can be tried.
 * With a record it is that real client, freelancer or agency as they would see it, and it is read-only:
 * every change is refused, so a preview can never alter a real account.
 */
export function previewUser(real: AuthedUser, choice: PreviewRole | PreviewChoice): AuthedUser {
  const { role, recordId } = typeof choice === "string" ? { role: choice, recordId: null } : choice;
  if (recordId) {
    return {
      ...real,
      role,
      links: {
        companyId: role === "CLIENT" ? recordId : null,
        freelancerId: role === "FREELANCER" ? recordId : null,
        agencyId: role === "AGENCY" ? recordId : null,
      },
      previewing: true,
      previewReadOnly: true,
    };
  }
  return {
    ...real,
    role,
    orgId: DEMO_ORG,
    links: {
      companyId: role === "CLIENT" ? DEMO_IDS.company : null,
      freelancerId: role === "FREELANCER" ? DEMO_IDS.freelancer : null,
      agencyId: role === "AGENCY" ? DEMO_IDS.agency : null,
    },
    previewing: true,
  };
}
