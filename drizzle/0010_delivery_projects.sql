CREATE TABLE "delivery_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"company_id" text NOT NULL,
	"deal_id" text,
	"scope_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"budget_paise" integer DEFAULT 0 NOT NULL,
	"start_date" text,
	"due_date" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"percent" integer DEFAULT 0 NOT NULL,
	"amount_paise" integer DEFAULT 0 NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"invoice_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delivery_projects" ADD CONSTRAINT "delivery_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_projects" ADD CONSTRAINT "delivery_projects_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_projects" ADD CONSTRAINT "delivery_projects_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_delivery_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."delivery_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_delivery_projects_org_status" ON "delivery_projects" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_delivery_projects_company" ON "delivery_projects" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_delivery_projects_deal" ON "delivery_projects" USING btree ("org_id","deal_id");--> statement-breakpoint
CREATE INDEX "idx_project_milestones_project" ON "project_milestones" USING btree ("project_id","position");