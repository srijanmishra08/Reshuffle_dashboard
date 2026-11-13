CREATE TABLE "expense_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"kind" text NOT NULL,
	"entry_date" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"category_id" text,
	"description" text DEFAULT '' NOT NULL,
	"company_id" text,
	"project_id" text,
	"source_type" text DEFAULT 'MANUAL' NOT NULL,
	"source_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_expense_categories_org_name" ON "expense_categories" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "idx_ledger_org_date" ON "ledger_entries" USING btree ("org_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ledger_source" ON "ledger_entries" USING btree ("org_id","source_type","source_id");