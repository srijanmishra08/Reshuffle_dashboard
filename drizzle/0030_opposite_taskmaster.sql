ALTER TABLE "docs" ADD COLUMN "status" text DEFAULT 'PUBLISHED' NOT NULL;--> statement-breakpoint
-- Docs that already exist were written to be used, so they start as published; new ones start as drafts.
ALTER TABLE "docs" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "deal_id" text;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_docs_company" ON "docs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_docs_deal" ON "docs" USING btree ("deal_id");