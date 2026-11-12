export const roleValues = ["ADMIN", "MANAGER", "MEMBER", "FREELANCER"] as const;
export type Role = (typeof roleValues)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roleValues as readonly string[]).includes(value);
}

/** Internal team: everyone except freelancers. */
export const STAFF: readonly Role[] = ["ADMIN", "MANAGER", "MEMBER"];
export const MANAGERS: readonly Role[] = ["ADMIN", "MANAGER"];
export const ADMIN_ONLY: readonly Role[] = ["ADMIN"];

export function roleAllowed(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}
