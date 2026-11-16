import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { companies } from "./crm";

export const questionTypeValues = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "date",
  "dropdown",
  "multiple_choice",
  "checkbox",
] as const;
export type QuestionType = (typeof questionTypeValues)[number];

export type Question = { id: string; label: string; type: QuestionType; required: boolean; options: string[] };
export type Answers = Record<string, string | string[]>;

export const questionnaireStatusValues = ["OPEN", "CLOSED"] as const;
export type QuestionnaireStatus = (typeof questionnaireStatusValues)[number];

/**
 * A form that a client fills in from a public link. `token` is the credential in that link;
 * it is stored so staff can copy the link again, and it only ever exposes the blank form.
 */
export const questionnaires = pgTable(
  "questionnaires",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    questions: jsonb("questions").$type<Question[]>().notNull(),
    status: text("status").notNull().default("OPEN"),
    token: text("token").notNull(),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_questionnaires_org").on(t.orgId), uniqueIndex("uq_questionnaires_token").on(t.token)]
).enableRLS();

/** One submission. `questions` is a copy of the form as it was answered, so later edits do not change old responses. */
export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    questionnaireId: text("questionnaire_id")
      .notNull()
      .references(() => questionnaires.id, { onDelete: "cascade" }),
    questions: jsonb("questions").$type<Question[]>().notNull(),
    answers: jsonb("answers").$type<Answers>().notNull(),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
  },
  (t) => [index("idx_questionnaire_responses_form").on(t.questionnaireId, t.submittedAt)]
).enableRLS();
