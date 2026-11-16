CREATE TABLE "finance_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "freelancer_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"freelancer_id" text NOT NULL,
	"project_id" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"allocation_pct" integer DEFAULT 100 NOT NULL,
	"start_date" text,
	"end_date" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "freelancer_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"freelancer_id" text NOT NULL,
	"project_id" text,
	"description" text DEFAULT '' NOT NULL,
	"amount_paise" integer NOT NULL,
	"due_date" text,
	"paid_on" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "freelancer_assignments" ADD CONSTRAINT "freelancer_assignments_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freelancer_assignments" ADD CONSTRAINT "freelancer_assignments_project_id_delivery_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."delivery_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_freelancer_id_freelancers_id_fk" FOREIGN KEY ("freelancer_id") REFERENCES "public"."freelancers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_project_id_delivery_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."delivery_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_finance_plans_org_key" ON "finance_plans" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "idx_assignments_freelancer" ON "freelancer_assignments" USING btree ("freelancer_id","status");--> statement-breakpoint
CREATE INDEX "idx_assignments_project" ON "freelancer_assignments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_payouts_org_status" ON "payouts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "idx_payouts_freelancer" ON "payouts" USING btree ("freelancer_id");