CREATE TABLE "docs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"type" text DEFAULT 'NOTE' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "docs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_docs_org_type" ON "docs" USING btree ("org_id","type");