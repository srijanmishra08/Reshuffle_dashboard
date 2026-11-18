CREATE TABLE "company_modules" (
	"org_id" text DEFAULT 'default' NOT NULL,
	"company_id" text NOT NULL,
	"module_id" text NOT NULL,
	CONSTRAINT "company_modules_company_id_module_id_pk" PRIMARY KEY("company_id","module_id")
);
--> statement-breakpoint
ALTER TABLE "company_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_module_id_modules_library_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules_library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_company_modules_module" ON "company_modules" USING btree ("module_id");--> statement-breakpoint
-- Clients keep the modules they already had through their deals that are not lost.
INSERT INTO "company_modules" ("org_id", "company_id", "module_id")
SELECT DISTINCT d."org_id", d."company_id", dm."module_id"
FROM "deal_modules" dm
JOIN "deals" d ON d."id" = dm."deal_id"
WHERE d."stage" <> 'LOST'
ON CONFLICT DO NOTHING;
