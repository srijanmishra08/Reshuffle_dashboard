CREATE TABLE `deal_stage_history` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`deal_id` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`note` text,
	`changed_by` text,
	`at` text NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_deal_history_deal` ON `deal_stage_history` (`deal_id`);--> statement-breakpoint
CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`company_id` text NOT NULL,
	`title` text NOT NULL,
	`stage` text DEFAULT 'LEAD' NOT NULL,
	`value_paise` integer DEFAULT 0 NOT NULL,
	`vertical_id` text,
	`engagement_model` text,
	`source` text,
	`referrer` text,
	`quotation_status` text DEFAULT 'NONE' NOT NULL,
	`current_block` text,
	`temperature` text,
	`lost_reason` text,
	`expected_close` text,
	`next_follow_up` text,
	`owner_id` text,
	`external_id` text,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vertical_id`) REFERENCES `verticals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_deals_org_stage` ON `deals` (`org_id`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_deals_company` ON `deals` (`company_id`);--> statement-breakpoint
CREATE TABLE `diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`deal_id` text NOT NULL,
	`level` integer NOT NULL,
	`bucket` text NOT NULL,
	`question` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`pain_score` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_diagnoses_deal` ON `diagnoses` (`deal_id`);