CREATE TABLE `letters` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`company_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`number` text,
	`fy` text,
	`recipient_name` text DEFAULT '' NOT NULL,
	`recipient_address` text,
	`subject` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`issue_date` text,
	`issue_key` text,
	`snapshot_json` text,
	`issued_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_letters_org_status` ON `letters` (`org_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_letters_org_number` ON `letters` (`org_id`,`number`);