import { randomBytes } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import type { Answers, Question } from "@/server/db/schema/questionnaires";
import { questionnaireInputSchema, questionnairePatchSchema, responseInputSchema } from "@/lib/schemas/questionnaires";
import { fail, ok } from "@/server/lib/result";
import { allowRequest } from "@/server/lib/rate-limit";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { questionnaires, questionnaireResponses, companies } = schema;

function audit(db: Db, ctx: ServiceContext, action: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `questionnaire.${action}`, module: "crm", entityType: "questionnaire", entityId: id },
    db
  );
}

async function companyInOrg(db: Db, ctx: ServiceContext, companyId: string) {
  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.orgId, ctx.orgId)))
    .limit(1);
  return rows.length > 0;
}

export async function listQuestionnaires(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select({
      id: questionnaires.id,
      title: questionnaires.title,
      status: questionnaires.status,
      companyId: questionnaires.companyId,
      companyName: companies.name,
      createdAt: questionnaires.createdAt,
      responses: count(questionnaireResponses.id),
    })
    .from(questionnaires)
    .leftJoin(companies, eq(companies.id, questionnaires.companyId))
    .leftJoin(questionnaireResponses, eq(questionnaireResponses.questionnaireId, questionnaires.id))
    .where(eq(questionnaires.orgId, ctx.orgId))
    .groupBy(questionnaires.id, companies.name)
    .orderBy(desc(questionnaires.createdAt));
  return ok(rows);
}

export async function createQuestionnaire(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = questionnaireInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid form", parsed.error.flatten());
  const input = parsed.data;
  if (input.companyId && !(await companyInOrg(db, ctx, input.companyId))) return fail("NOT_FOUND", "Client not found");
  const [row] = await db
    .insert(questionnaires)
    .values({
      orgId: ctx.orgId,
      companyId: input.companyId ?? null,
      title: input.title,
      description: input.description,
      questions: input.questions,
      token: randomBytes(24).toString("base64url"),
      createdBy: ctx.userId,
    })
    .returning();
  await audit(db, ctx, "created", row.id);
  return ok(row);
}

async function findOwned(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(questionnaires)
    .where(and(eq(questionnaires.id, id), eq(questionnaires.orgId, ctx.orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The form with its share path and every response, newest first. */
export async function getQuestionnaire(db: Db, ctx: ServiceContext, id: string) {
  const form = await findOwned(db, ctx, id);
  if (!form) return fail("NOT_FOUND", "Questionnaire not found");
  const responses = await db
    .select({
      id: questionnaireResponses.id,
      questions: questionnaireResponses.questions,
      answers: questionnaireResponses.answers,
      submittedAt: questionnaireResponses.submittedAt,
    })
    .from(questionnaireResponses)
    .where(eq(questionnaireResponses.questionnaireId, id))
    .orderBy(desc(questionnaireResponses.submittedAt))
    .limit(500);
  return ok({ ...form, path: `/p/form/${form.token}`, responses });
}

export async function updateQuestionnaire(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = questionnairePatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid form", parsed.error.flatten());
  const form = await findOwned(db, ctx, id);
  if (!form) return fail("NOT_FOUND", "Questionnaire not found");
  const patch = parsed.data;
  if (patch.companyId && !(await companyInOrg(db, ctx, patch.companyId))) return fail("NOT_FOUND", "Client not found");
  const [row] = await db
    .update(questionnaires)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(questionnaires.id, id))
    .returning();
  await audit(db, ctx, "updated", id);
  return ok(row);
}

/** Deletes the form and, through the foreign key, every response to it. */
export async function deleteQuestionnaire(db: Db, ctx: ServiceContext, id: string) {
  const form = await findOwned(db, ctx, id);
  if (!form) return fail("NOT_FOUND", "Questionnaire not found");
  await db.delete(questionnaires).where(eq(questionnaires.id, id));
  await audit(db, ctx, "deleted", id);
  return ok({ id });
}

async function findByToken(db: Db, token: string) {
  if (typeof token !== "string" || token.length < 16 || token.length > 100) return null;
  const rows = await db.select().from(questionnaires).where(eq(questionnaires.token, token)).limit(1);
  return rows[0] ?? null;
}

/** Public. Returns only what the person filling the form needs to see. */
export async function getPublicQuestionnaire(db: Db, token: string) {
  const form = await findByToken(db, token);
  if (!form) return fail("NOT_FOUND", "Form not found");
  return ok({ title: form.title, description: form.description, questions: form.questions, open: form.status === "OPEN" });
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks answers against the form. Returns the cleaned answers or the first problem found. */
export function validateAnswers(questions: Question[], raw: Answers): { ok: true; answers: Answers } | { ok: false; error: string } {
  const answers: Answers = {};
  for (const q of questions) {
    const value = raw[q.id];
    if (q.type === "checkbox") {
      const picked = Array.isArray(value) ? [...new Set(value)] : [];
      if (picked.some((v) => !q.options.includes(v))) return { ok: false, error: `Choose from the listed options: ${q.label}` };
      if (q.required && picked.length === 0) return { ok: false, error: `Please answer: ${q.label}` };
      if (picked.length) answers[q.id] = picked;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (q.required) return { ok: false, error: `Please answer: ${q.label}` };
      continue;
    }
    if (q.type !== "long_text" && text.length > 500) return { ok: false, error: `Answer is too long: ${q.label}` };
    if (q.type === "email" && !emailPattern.test(text)) return { ok: false, error: `Enter a valid email: ${q.label}` };
    if (q.type === "phone" && !/^[0-9+()\-\s]{6,20}$/.test(text)) return { ok: false, error: `Enter a valid phone number: ${q.label}` };
    if (q.type === "number" && !/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, error: `Enter a number: ${q.label}` };
    if (q.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, error: `Enter a date: ${q.label}` };
    if ((q.type === "dropdown" || q.type === "multiple_choice") && !q.options.includes(text)) {
      return { ok: false, error: `Choose from the listed options: ${q.label}` };
    }
    answers[q.id] = text;
  }
  return { ok: true, answers };
}

/** Public. The unguessable token is the credential; submissions are rate limited per IP and per form. */
export async function submitResponse(db: Db, token: string, raw: unknown, meta: { ip: string | null }) {
  const allowedIp = await allowRequest(db, `form-submit:${meta.ip ?? "unknown"}`, { limit: 10, windowSeconds: 600 });
  if (!allowedIp) return fail("FORBIDDEN", "Too many submissions. Please try again later.");
  const parsed = responseInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid submission", parsed.error.flatten());
  const form = await findByToken(db, token);
  if (!form) return fail("NOT_FOUND", "Form not found");
  if (form.status !== "OPEN") return fail("CONFLICT", "This form is closed");
  // A bot that fills the hidden field is told all is well and nothing is stored.
  if (parsed.data.website) return ok({ submitted: true });
  const allowedForm = await allowRequest(db, `form-total:${form.id}`, { limit: 200, windowSeconds: 86400 });
  if (!allowedForm) return fail("FORBIDDEN", "This form has received too many submissions today.");

  const checked = validateAnswers(form.questions, parsed.data.answers);
  if (!checked.ok) return fail("VALIDATION", checked.error);
  const [row] = await db
    .insert(questionnaireResponses)
    .values({ orgId: form.orgId, questionnaireId: form.id, questions: form.questions, answers: checked.answers })
    .returning({ id: questionnaireResponses.id });
  await logActivity(
    { action: "questionnaire.response", module: "crm", entityType: "questionnaire", entityId: form.id },
    db
  );
  return ok({ submitted: true, id: row.id });
}
