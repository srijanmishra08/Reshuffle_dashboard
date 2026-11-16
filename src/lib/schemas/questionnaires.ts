import { z } from "zod";

export const questionTypes = [
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
export type QuestionTypeName = (typeof questionTypes)[number];

export const questionTypeLabels: Record<QuestionTypeName, string> = {
  short_text: "Short text",
  long_text: "Long text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  multiple_choice: "Multiple choice (pick one)",
  checkbox: "Checkboxes (pick any)",
};

export const choiceTypes: readonly QuestionTypeName[] = ["dropdown", "multiple_choice", "checkbox"];

export const questionSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1, "Every question needs a label").max(300),
    type: z.enum(questionTypes),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  })
  .refine((q) => !choiceTypes.includes(q.type) || q.options.length >= 2, {
    message: "Choice questions need at least two options",
  });
export type QuestionInput = z.infer<typeof questionSchema>;

const questionList = z
  .array(questionSchema)
  .min(1, "Add at least one question")
  .max(50)
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, { message: "Question ids must be unique" });

export const questionnaireInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).default(""),
  companyId: z
    .string()
    .trim()
    .max(100)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  questions: questionList,
});

export const questionnairePatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  companyId: z
    .string()
    .trim()
    .max(100)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  questions: questionList.optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});

export const responseInputSchema = z.object({
  answers: z.record(z.string().max(40), z.union([z.string().max(5000), z.array(z.string().max(120)).max(30)])),
  /** Hidden field that people never see. A filled value means a bot. */
  website: z.string().max(200).optional(),
});

/** The questions a new form starts with. Carried over from the old tools page. */
export function defaultQuestions(): QuestionInput[] {
  return [
    { id: "q1", label: "What is your full name?", type: "short_text", required: true, options: [] },
    { id: "q2", label: "What is your email address?", type: "email", required: true, options: [] },
    { id: "q3", label: "What is your phone number?", type: "phone", required: false, options: [] },
    { id: "q4", label: "What is your business or brand name?", type: "short_text", required: false, options: [] },
    {
      id: "q5",
      label: "What industry are you in?",
      type: "dropdown",
      required: false,
      options: ["Retail", "Manufacturing", "Food and dairy", "Healthcare", "Education", "Services", "Technology", "Other"],
    },
    { id: "q6", label: "Briefly describe your project or the problem you want solved", type: "long_text", required: true, options: [] },
    {
      id: "q7",
      label: "Which areas need attention?",
      type: "checkbox",
      required: false,
      options: ["Revenue", "Marketing", "Operations", "Customer experience", "Management"],
    },
    { id: "q8", label: "What is your budget range?", type: "short_text", required: false, options: [] },
    { id: "q9", label: "When would you like to start?", type: "date", required: false, options: [] },
  ];
}
