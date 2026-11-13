CREATE TABLE "letters" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"company_id" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"number" text,
	"fy" text,
	"recipient_name" text DEFAULT '' NOT NULL,
	"recipient_address" text,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"issue_date" text,
	"issue_key" text,
	"snapshot_json" jsonb,
	"issued_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_letters_org_status" ON "letters" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_letters_org_number" ON "letters" USING btree ("org_id","number");