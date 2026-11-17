CREATE TABLE "agencies" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agency_freelancers" (
	"agency_id" text NOT NULL,
	"freelancer_id" text NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_freelancers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD COLUMN "freelancer_id" text;--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD COLUMN "agency_id" text;--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "agency_freelancers" ADD CONSTRAINT "agency_freelancers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_freelancers" ADD CONSTRAINT "agency_freelancers_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agencies_org_name" ON "agencies" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agency_freelancers_freelancer" ON "agency_freelancers" USING btree ("freelancer_id");--> statement-breakpoint
CREATE INDEX "idx_agency_freelancers_agency" ON "agency_freelancers" USING btree ("agency_id");--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD CONSTRAINT "allowed_emails_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD CONSTRAINT "allowed_emails_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD CONSTRAINT "allowed_emails_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;