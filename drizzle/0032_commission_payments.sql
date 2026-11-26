CREATE TABLE "commission_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"sales_node_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"paid_on" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_sales_node_id_sales_nodes_id_fk" FOREIGN KEY ("sales_node_id") REFERENCES "public"."sales_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_commission_payments_node" ON "commission_payments" USING btree ("org_id","sales_node_id");--> statement-breakpoint
CREATE INDEX "idx_commission_payments_deal" ON "commission_payments" USING btree ("deal_id");