export const roleValues = ["ADMIN", "MANAGER", "MEMBER", "FREELANCER", "CLIENT", "AGENCY"] as const;
export type Role = (typeof roleValues)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roleValues as readonly string[]).includes(value);
}

/** Internal team. Freelancers, clients and partner agencies are outside it and use their own portals. */
export const STAFF: readonly Role[] = ["ADMIN", "MANAGER", "MEMBER"];
export const MANAGERS: readonly Role[] = ["ADMIN", "MANAGER"];
export const ADMIN_ONLY: readonly Role[] = ["ADMIN"];

export function roleAllowed(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}

/** Outside people. Each has one portal and sees only the records linked to their sign-in. */
export const PORTAL_ROLES: readonly Role[] = ["CLIENT", "AGENCY", "FREELANCER"];

/** What a sign-in is linked to. Clients link to a company, freelancers to a freelancer, partner agencies to an agency. */
export const LINK_FOR_ROLE = { CLIENT: "companyId", FREELANCER: "freelancerId", AGENCY: "agencyId" } as const;

/** Where a person lands after signing in. */
export function homeFor(role: Role): string {
  switch (role) {
    case "CLIENT":
      return "/portal";
    case "FREELANCER":
      return "/me";
    case "AGENCY":
      return "/agency";
    default:
      return "/";
  }
}
