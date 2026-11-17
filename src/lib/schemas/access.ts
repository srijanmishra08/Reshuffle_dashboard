import { z } from "zod";
import { roleValues } from "@/server/roles";

export const roleLabels: Record<(typeof roleValues)[number], string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  MEMBER: "Team member",
  CLIENT: "Client",
  AGENCY: "Partner agency",
  FREELANCER: "Freelancer",
};

const optionalId = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const accessInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  role: z.enum(roleValues),
  companyId: optionalId,
  freelancerId: optionalId,
  agencyId: optionalId,
});

export const accessRevokeSchema = z.object({ email: z.string().trim().toLowerCase().min(3).max(200) });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const agencyInputSchema = z.object({
  name: z.string().trim().min(1, "Agency name is required").max(200),
  contactName: optionalText(200),
  contactEmail: optionalText(200),
  notes: optionalText(2000),
});

export const agencyPatchSchema = agencyInputSchema.partial();

export const agencyMemberSchema = z.object({ freelancerId: z.string().trim().min(1, "Choose a freelancer").max(100) });

/** Statuses a freelancer or agency may set on a task they are assigned. Finishing and billing stay with the team and the client. */
export const portalTaskStatuses = ["TODO", "IN_PROGRESS", "CLIENT_REVIEW"] as const;

export const portalTaskUpdateSchema = z
  .object({
    status: z.enum(portalTaskStatuses).optional(),
    assigneeId: z.string().trim().min(1).max(100).optional(),
  })
  .refine((v) => v.status !== undefined || v.assigneeId !== undefined, { message: "Nothing to change" });

export const commentBody = z.string().trim().min(1, "Write a comment").max(2000, "Keep the comment under 2000 characters");

/** The client's answer on work in review. Asking for changes needs a reason; approving may carry a note. */
export const clientTaskResponseSchema = z
  .object({
    decision: z.enum(["APPROVE", "REVISE"]),
    comment: z.string().trim().max(2000, "Keep the comment under 2000 characters").optional(),
  })
  .refine((v) => v.decision === "APPROVE" || (v.comment ?? "").length > 0, { message: "Tell the team what to change", path: ["comment"] });

export const portalCommentSchema = z.object({ body: commentBody });

/** A note from the team. Internal notes are hidden from the client. */
export const teamCommentSchema = z.object({ body: commentBody, internal: z.boolean().default(false) });
