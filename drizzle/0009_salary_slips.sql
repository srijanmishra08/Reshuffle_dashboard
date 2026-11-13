CREATE TABLE "salary_slips" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"person_id" text NOT NULL,
	"pay_period" text NOT NULL,
	"pay_date" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"earnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gross_paise" integer DEFAULT 0 NOT NULL,
	"deductions_paise" integer DEFAULT 0 NOT NULL,
	"net_paise" integer DEFAULT 0 NOT NULL,
	"number" text,
	"fy" text,
	"issue_key" text,
	"snapshot_json" jsonb,
	"issued_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "salary_slips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_salary_slips_person" ON "salary_slips" USING btree ("person_id","pay_period");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_salary_slips_org_number" ON "salary_slips" USING btree ("org_id","number");