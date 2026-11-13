CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'EMPLOYEE' NOT NULL,
	"joined_on" text,
	"pan_enc" text,
	"pan_last4" text,
	"bank_account_enc" text,
	"bank_account_last4" text,
	"bank_ifsc" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_people_org" ON "people" USING btree ("org_id");