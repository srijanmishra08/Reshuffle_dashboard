CREATE TABLE "deal_stage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"deal_id" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"note" text,
	"changed_by" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal_stage_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"company_id" text NOT NULL,
	"title" text NOT NULL,
	"stage" text DEFAULT 'LEAD' NOT NULL,
	"value_paise" integer DEFAULT 0 NOT NULL,
	"vertical_id" text,
	"engagement_model" text,
	"source" text,
	"referrer" text,
	"quotation_status" text DEFAULT 'NONE' NOT NULL,
	"current_block" text,
	"temperature" text,
	"lost_reason" text,
	"expected_close" text,
	"next_follow_up" text,
	"owner_id" text,
	"external_id" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"deal_id" text NOT NULL,
	"level" integer NOT NULL,
	"bucket" text NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"pain_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagnoses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_vertical_id_verticals_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deal_history_deal" ON "deal_stage_history" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_deals_org_stage" ON "deals" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "idx_deals_company" ON "deals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_diagnoses_deal" ON "diagnoses" USING btree ("deal_id");