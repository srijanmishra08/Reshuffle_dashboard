CREATE TABLE "work_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"sac_code" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"rate_paise" integer DEFAULT 0 NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"company_id" text NOT NULL,
	"deal_id" text,
	"project_id" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"number" text,
	"fy" text,
	"customer_ref" text,
	"requested_by" text,
	"department" text,
	"job_details" text,
	"comments" text,
	"issue_date" text,
	"completed_date" text,
	"place_of_supply" text DEFAULT '' NOT NULL,
	"tax_mode" text DEFAULT 'INTRA' NOT NULL,
	"rate_bps" integer DEFAULT 1800 NOT NULL,
	"subtotal_paise" integer DEFAULT 0 NOT NULL,
	"cgst_paise" integer DEFAULT 0 NOT NULL,
	"sgst_paise" integer DEFAULT 0 NOT NULL,
	"igst_paise" integer DEFAULT 0 NOT NULL,
	"round_off_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"issue_key" text,
	"snapshot_json" jsonb,
	"issued_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_work_order_items_wo" ON "work_order_items" USING btree ("work_order_id","position");--> statement-breakpoint
CREATE INDEX "idx_work_orders_org_status" ON "work_orders" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_work_orders_company" ON "work_orders" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_work_orders_org_number" ON "work_orders" USING btree ("org_id","number");