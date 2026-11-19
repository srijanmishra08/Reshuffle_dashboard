import { z } from "zod";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const idempotencyKey = z.string().trim().min(8, "Missing request key").max(100);
const optionalId = z.string().trim().min(1).max(100).optional();

const compose = {
  to: email,
  subject: z.string().trim().min(1, "Add a subject").max(200),
  body: z.string().trim().min(1, "Write a message").max(10_000),
  companyId: optionalId,
  contactId: optionalId,
  dealId: optionalId,
  idempotencyKey,
};

/** What a team member can send. Staff write follow-ups and outreach themselves; the scope email is built on the server. */
export const mailSendSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FOLLOWUP"), ...compose }),
  z.object({ kind: z.literal("OUTREACH"), ...compose }),
  z.object({
    kind: z.literal("SCOPE_LINK"),
    to: email,
    scopeId: z.string().trim().min(1).max(100),
    /** The path returned once when the share link was created, such as `/p/<token>`. */
    path: z.string().regex(/^\/p\/[A-Za-z0-9_-]{8,200}$/, "Invalid share link"),
    idempotencyKey,
  }),
]);
export type MailSendInput = z.infer<typeof mailSendSchema>;

/** Admin only: the invitation goes to an email that already has access. */
export const mailInviteSchema = z.object({ email, idempotencyKey });
export type MailInviteInput = z.infer<typeof mailInviteSchema>;

export const outboxQuerySchema = z.object({
  status: z.enum(["QUEUED", "SENDING", "SENT", "FAILED", "DEAD"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
