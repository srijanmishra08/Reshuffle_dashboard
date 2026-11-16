import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { defaultQuestions } from "@/lib/schemas/questionnaires";
import {
  createQuestionnaire,
  deleteQuestionnaire,
  getPublicQuestionnaire,
  getQuestionnaire,
  listQuestionnaires,
  submitResponse,
  updateQuestionnaire,
} from "../questionnaires";

const ctx = { orgId: "default", userId: "user-1" };
const other = { orgId: "other", userId: "user-2" };
let db: Db;
let cleanup: () => void;
let ipSeq = 0;
const ip = () => ({ ip: `10.0.0.${++ipSeq}` });

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const good = { q1: "Test Person", q2: "person@example.com", q6: "Need a sample system", q7: ["Revenue", "Operations"] };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

describe("questionnaires", () => {
  it("rejects a form with no questions or a choice question without options", async () => {
    expect((await createQuestionnaire(db, ctx, { title: "Empty", questions: [] })).ok).toBe(false);
    const bad = await createQuestionnaire(db, ctx, {
      title: "Bad",
      questions: [{ id: "a", label: "Pick", type: "dropdown", required: false, options: ["Only one"] }],
    });
    expect(bad.ok).toBe(false);
  });

  it("creates a form, shows it publicly by token and stores a valid response", async () => {
    const form = must(await createQuestionnaire(db, ctx, { title: "Onboarding", questions: defaultQuestions() }));
    const pub = must(await getPublicQuestionnaire(db, form.token));
    expect(pub.open).toBe(true);
    expect(pub.questions).toHaveLength(9);
    expect(Object.keys(pub)).toEqual(["title", "description", "questions", "open"]);

    must(await submitResponse(db, form.token, { answers: good }, ip()));
    const detail = must(await getQuestionnaire(db, ctx, form.id));
    expect(detail.path).toBe(`/p/form/${form.token}`);
    expect(detail.responses).toHaveLength(1);
    expect(detail.responses[0].answers).toEqual(good);
    expect(must(await listQuestionnaires(db, ctx))[0].responses).toBe(1);
  });

  it("refuses missing required answers, bad emails and options that are not on the form", async () => {
    const form = must(await createQuestionnaire(db, ctx, { title: "Checks", questions: defaultQuestions() }));
    const submit = (answers: Record<string, unknown>) => submitResponse(db, form.token, { answers }, ip());
    expect((await submit({ q2: "person@example.com", q6: "x" })).ok).toBe(false);
    expect((await submit({ ...good, q2: "not-an-email" })).ok).toBe(false);
    expect((await submit({ ...good, q5: "Made up" })).ok).toBe(false);
    expect((await submit({ ...good, q7: ["Made up"] })).ok).toBe(false);
    expect((await submit({ ...good, q9: "tomorrow" })).ok).toBe(false);
    expect(must(await getQuestionnaire(db, ctx, form.id)).responses).toHaveLength(0);
  });

  it("drops unknown keys, ignores bots and refuses a closed form or a wrong token", async () => {
    const form = must(await createQuestionnaire(db, ctx, { title: "Closing", questions: defaultQuestions() }));
    must(await submitResponse(db, form.token, { answers: { ...good, extra: "x" } }, ip()));
    must(await submitResponse(db, form.token, { answers: good, website: "http://spam.example" }, ip()));
    const detail = must(await getQuestionnaire(db, ctx, form.id));
    expect(detail.responses).toHaveLength(1);
    expect(detail.responses[0].answers).not.toHaveProperty("extra");

    must(await updateQuestionnaire(db, ctx, form.id, { status: "CLOSED" }));
    expect((await submitResponse(db, form.token, { answers: good }, ip())).ok).toBe(false);
    expect((await submitResponse(db, "x".repeat(32), { answers: good }, ip())).ok).toBe(false);
    expect((await getPublicQuestionnaire(db, "short")).ok).toBe(false);
  });

  it("keeps old responses readable after the questions change", async () => {
    const form = must(await createQuestionnaire(db, ctx, { title: "Edits", questions: defaultQuestions() }));
    must(await submitResponse(db, form.token, { answers: good }, ip()));
    must(
      await updateQuestionnaire(db, ctx, form.id, {
        questions: [{ id: "n1", label: "New question", type: "short_text", required: true, options: [] }],
      })
    );
    const detail = must(await getQuestionnaire(db, ctx, form.id));
    expect(detail.questions).toHaveLength(1);
    expect(detail.responses[0].questions).toHaveLength(9);
  });

  it("limits submissions per IP", async () => {
    const form = must(await createQuestionnaire(db, ctx, { title: "Limit", questions: defaultQuestions() }));
    const same = { ip: "10.9.9.9" };
    for (let i = 0; i < 10; i++) must(await submitResponse(db, form.token, { answers: good }, same));
    expect((await submitResponse(db, form.token, { answers: good }, same)).ok).toBe(false);
  });

  it("is invisible to another organisation and deletes with its responses", async () => {
    const form = must(await createQuestionnaire(db, ctx, { title: "Private", questions: defaultQuestions() }));
    expect((await getQuestionnaire(db, other, form.id)).ok).toBe(false);
    expect((await updateQuestionnaire(db, other, form.id, { title: "Hijack" })).ok).toBe(false);
    expect((await deleteQuestionnaire(db, other, form.id)).ok).toBe(false);
    expect(must(await listQuestionnaires(db, other))).toHaveLength(0);
    must(await deleteQuestionnaire(db, ctx, form.id));
    expect((await getPublicQuestionnaire(db, form.token)).ok).toBe(false);
  });
});
