CREATE TABLE "modules_library" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"description" text,
	"default_deliverables" text,
	"default_days" integer DEFAULT 0 NOT NULL,
	"default_price_paise" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modules_library" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scope_items" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"phase" text DEFAULT 'Phase 1' NOT NULL,
	"module_id" text,
	"title" text NOT NULL,
	"description" text,
	"days" integer DEFAULT 0 NOT NULL,
	"price_paise" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scope_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"deal_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"problem_statement" text DEFAULT '' NOT NULL,
	"engagement_model" text,
	"payment_schedule_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"timeline_days" integer DEFAULT 0 NOT NULL,
	"number" text,
	"fy" text,
	"send_key" text,
	"snapshot_json" jsonb,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_module_id_modules_library_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_library"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_modules_org" ON "modules_library" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "idx_scope_items_scope" ON "scope_items" USING btree ("scope_id","position");--> statement-breakpoint
CREATE INDEX "idx_scopes_deal" ON "scopes" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scopes_deal_version" ON "scopes" USING btree ("deal_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scopes_org_number" ON "scopes" USING btree ("org_id","number");