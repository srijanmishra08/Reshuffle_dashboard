-- Verticals are replaced by modules (SKUs). This permanently deletes the verticals table and every vertical link.
-- The links go first: dropping the table first would remove the constraints and make the explicit drops fail.
ALTER TABLE "companies" DROP CONSTRAINT "companies_vertical_id_verticals_id_fk";
--> statement-breakpoint
ALTER TABLE "deals" DROP CONSTRAINT "deals_vertical_id_verticals_id_fk";
--> statement-breakpoint
ALTER TABLE "social_accounts" DROP CONSTRAINT "social_accounts_vertical_id_verticals_id_fk";
--> statement-breakpoint
DROP INDEX "idx_companies_vertical";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "vertical_id";--> statement-breakpoint
ALTER TABLE "deals" DROP COLUMN "vertical_id";--> statement-breakpoint
ALTER TABLE "social_accounts" DROP COLUMN "vertical_id";--> statement-breakpoint
DROP TABLE "verticals";
