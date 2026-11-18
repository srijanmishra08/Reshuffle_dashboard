import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";

const { modulesLibrary, companyModules } = schema;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * De-duplicated module ids and the sum of their library prices, or null when any of them is not a module of this
 * organisation. Modules are SKUs: a lead's value defaults to the sum of the prices of the modules it needs.
 */
export async function resolveModules(
  db: Db | Tx,
  orgId: string,
  ids: string[] | undefined
): Promise<{ ids: string[]; pricePaise: number } | null> {
  const unique = [...new Set(ids ?? [])];
  if (unique.length === 0) return { ids: [], pricePaise: 0 };
  const found = await db
    .select({ id: modulesLibrary.id, price: modulesLibrary.defaultPricePaise })
    .from(modulesLibrary)
    .where(and(eq(modulesLibrary.orgId, orgId), inArray(modulesLibrary.id, unique)));
  if (found.length !== unique.length) return null;
  return { ids: unique, pricePaise: found.reduce((sum, m) => sum + m.price, 0) };
}

/** Adds modules to a client without removing any it already has. */
export async function addCompanyModules(db: Db | Tx, orgId: string, companyId: string, moduleIds: string[]) {
  if (moduleIds.length === 0) return;
  await db
    .insert(companyModules)
    .values(moduleIds.map((moduleId) => ({ orgId, companyId, moduleId })))
    .onConflictDoNothing();
}

/** Makes the client's modules exactly this list. */
export async function setCompanyModules(db: Tx, orgId: string, companyId: string, moduleIds: string[]) {
  await db.delete(companyModules).where(and(eq(companyModules.orgId, orgId), eq(companyModules.companyId, companyId)));
  await addCompanyModules(db, orgId, companyId, moduleIds);
}
