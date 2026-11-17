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

/** The admin, acting as one outside role against the demo records. */
export function previewUser(real: AuthedUser, as: PreviewRole): AuthedUser {
  return {
    ...real,
    role: as,
    orgId: DEMO_ORG,
    links: {
      companyId: as === "CLIENT" ? DEMO_IDS.company : null,
      freelancerId: as === "FREELANCER" ? DEMO_IDS.freelancer : null,
      agencyId: as === "AGENCY" ? DEMO_IDS.agency : null,
    },
    previewing: true,
  };
}
