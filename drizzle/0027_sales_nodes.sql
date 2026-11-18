CREATE TABLE "sales_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'INDIVIDUAL' NOT NULL,
	"phone" text,
	"email" text,
	"commission_bps" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"user_id" text,
	"freelancer_id" text,
	"agency_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_nodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "sales_node_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sales_nodes_org_name" ON "sales_nodes" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "idx_sales_nodes_org_kind" ON "sales_nodes" USING btree ("org_id","kind");--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_sales_node_id_sales_nodes_id_fk" FOREIGN KEY ("sales_node_id") REFERENCES "public"."sales_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deals_sales_node" ON "deals" USING btree ("sales_node_id");
--> statement-breakpoint
-- Existing leads keep their referrer: each distinct referrer name becomes a sales node, and the leads are linked to it.
INSERT INTO "sales_nodes" ("id", "org_id", "name", "kind")
SELECT gen_random_uuid()::text, d."org_id", d."referrer",
  CASE
    WHEN lower(coalesce(d."source", '')) LIKE '%freelanc%' THEN 'FREELANCER'
    WHEN lower(coalesce(d."source", '')) LIKE '%agenc%' THEN 'AGENCY'
    WHEN lower(coalesce(d."source", '')) LIKE '%staff%' THEN 'SALES_STAFF'
    ELSE 'INDIVIDUAL'
  END
FROM (
  SELECT DISTINCT ON ("org_id", lower(trim("referrer"))) "org_id", trim("referrer") AS "referrer", "source"
  FROM "deals"
  WHERE "referrer" IS NOT NULL AND trim("referrer") <> ''
  ORDER BY "org_id", lower(trim("referrer")), "created_at"
) d
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "deals" SET "sales_node_id" = n."id"
FROM "sales_nodes" n
WHERE n."org_id" = "deals"."org_id" AND lower(n."name") = lower(trim("deals"."referrer"))
  AND "deals"."referrer" IS NOT NULL AND trim("deals"."referrer") <> '';
