import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { contactInputSchema, contactPatchSchema } from "@/lib/schemas/crm";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { getCompany, type ServiceContext } from "@/server/services/companies";

const { contacts } = schema;

const contactColumns = {
  id: contacts.id,
  companyId: contacts.companyId,
  name: contacts.name,
  role: contacts.role,
  phone: contacts.phone,
  email: contacts.email,
  whatsapp: contacts.whatsapp,
  whatsappRole: contacts.whatsappRole,
  onboarded: contacts.onboarded,
  approved: contacts.approved,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
};

export async function listContacts(db: Db, ctx: ServiceContext, companyId: string) {
  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) {
    return company;
  }

  const rows = await db
    .select(contactColumns)
    .from(contacts)
    .where(and(eq(contacts.companyId, companyId), eq(contacts.orgId, ctx.orgId), isNull(contacts.archivedAt)))
    .orderBy(asc(contacts.createdAt));

  return ok(rows);
}

async function getContact(db: Db, ctx: ServiceContext, companyId: string, contactId: string) {
  const rows = await db
    .select(contactColumns)
    .from(contacts)
    .where(
      and(
        eq(contacts.id, contactId),
        eq(contacts.companyId, companyId),
        eq(contacts.orgId, ctx.orgId),
        isNull(contacts.archivedAt)
      )
    )
    .limit(1);

  return rows[0] ? ok(rows[0]) : fail("NOT_FOUND", "Contact not found");
}

export async function createContact(db: Db, ctx: ServiceContext, companyId: string, raw: unknown) {
  const parsed = contactInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid contact", parsed.error.flatten());
  }

  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) {
    return company;
  }

  const input = parsed.data;
  const now = new Date();
  const inserted = await db
    .insert(contacts)
    .values({
      orgId: ctx.orgId,
      companyId,
      name: input.name,
      role: input.role ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      whatsapp: input.whatsapp ?? null,
      whatsappRole: input.whatsappRole ?? null,
      onboarded: input.onboarded ?? false,
      approved: input.approved ?? false,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: contacts.id });

  const id = inserted[0].id;

  await logActivity(
    { actorId: ctx.userId, action: "contact.created", module: "crm", entityType: "contact", entityId: id, metadata: { companyId } },
    db
  );

  return getContact(db, ctx, companyId, id);
}

export async function updateContact(db: Db, ctx: ServiceContext, companyId: string, contactId: string, raw: unknown) {
  const parsed = contactPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid contact update", parsed.error.flatten());
  }

  const existing = await getContact(db, ctx, companyId, contactId);
  if (!existing.ok) {
    return existing;
  }

  const changes = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined)
  ) as Record<string, unknown>;

  if (Object.keys(changes).length > 0) {
    await db
      .update(contacts)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.orgId, ctx.orgId)));

    await logActivity(
      {
        actorId: ctx.userId,
        action: "contact.updated",
        module: "crm",
        entityType: "contact",
        entityId: contactId,
        metadata: { fields: Object.keys(changes) },
      },
      db
    );
  }

  return getContact(db, ctx, companyId, contactId);
}

export async function archiveContact(db: Db, ctx: ServiceContext, companyId: string, contactId: string) {
  const existing = await getContact(db, ctx, companyId, contactId);
  if (!existing.ok) {
    return existing;
  }

  const now = new Date();
  await db
    .update(contacts)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, ctx.orgId)));

  await logActivity(
    { actorId: ctx.userId, action: "contact.archived", module: "crm", entityType: "contact", entityId: contactId },
    db
  );

  return ok({ id: contactId });
}
