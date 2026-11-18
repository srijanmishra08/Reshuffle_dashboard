CREATE TABLE "deal_modules" (
	"org_id" text DEFAULT 'default' NOT NULL,
	"deal_id" text NOT NULL,
	"module_id" text NOT NULL,
	CONSTRAINT "deal_modules_deal_id_module_id_pk" PRIMARY KEY("deal_id","module_id")
);
--> statement-breakpoint
ALTER TABLE "deal_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_modules" ADD CONSTRAINT "deal_modules_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_modules" ADD CONSTRAINT "deal_modules_module_id_modules_library_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deal_modules_module" ON "deal_modules" USING btree ("module_id");