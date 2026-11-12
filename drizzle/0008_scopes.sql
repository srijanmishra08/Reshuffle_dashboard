CREATE TABLE `modules_library` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`description` text,
	`default_deliverables` text,
	`default_days` integer DEFAULT 0 NOT NULL,
	`default_price_paise` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_modules_org` ON `modules_library` (`org_id`,`active`);--> statement-breakpoint
CREATE TABLE `scope_items` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`phase` text DEFAULT 'Phase 1' NOT NULL,
	`module_id` text,
	`title` text NOT NULL,
	`description` text,
	`days` integer DEFAULT 0 NOT NULL,
	`price_paise` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `scopes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules_library`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_scope_items_scope` ON `scope_items` (`scope_id`,`position`);--> statement-breakpoint
CREATE TABLE `scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`deal_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`title` text NOT NULL,
	`problem_statement` text DEFAULT '' NOT NULL,
	`engagement_model` text,
	`payment_schedule_json` text DEFAULT '[]' NOT NULL,
	`terms` text DEFAULT '' NOT NULL,
	`total_paise` integer DEFAULT 0 NOT NULL,
	`timeline_days` integer DEFAULT 0 NOT NULL,
	`number` text,
	`fy` text,
	`send_key` text,
	`snapshot_json` text,
	`sent_at` text,
	`accepted_at` text,
	`accepted_by` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_scopes_deal` ON `scopes` (`deal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scopes_deal_version` ON `scopes` (`deal_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scopes_org_number` ON `scopes` (`org_id`,`number`);