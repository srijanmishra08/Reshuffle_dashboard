CREATE TABLE "questionnaire_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"questionnaire_id" text NOT NULL,
	"questions" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "questionnaires" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"company_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"questions" jsonb NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"token" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questionnaires" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_questionnaire_responses_form" ON "questionnaire_responses" USING btree ("questionnaire_id","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_questionnaires_org" ON "questionnaires" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_questionnaires_token" ON "questionnaires" USING btree ("token");