CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"account_id" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'IDEA' NOT NULL,
	"scheduled_date" text,
	"caption" text,
	"link" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"vertical_id" text,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_vertical_id_verticals_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_content_items_org_date" ON "content_items" USING btree ("org_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "idx_social_accounts_org" ON "social_accounts" USING btree ("org_id");