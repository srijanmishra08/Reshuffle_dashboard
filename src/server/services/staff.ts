import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ok } from "@/server/lib/result";
import { STAFF } from "@/server/roles";
import type { ServiceContext } from "@/server/services/companies";

const { user } = schema;

/** Active team members who have signed in at least once: the people a lead can be assigned to. */
export async function listStaff(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(and(eq(user.orgId, ctx.orgId), eq(user.active, true), inArray(user.role, [...STAFF])))
    .orderBy(asc(user.name));
  return ok(rows);
}

/** True when `userId` is an active team member of this organisation. */
export async function isStaffMember(db: Db, orgId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.orgId, orgId), eq(user.active, true), inArray(user.role, [...STAFF])))
    .limit(1);
  return rows.length > 0;
}
