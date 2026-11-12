CREATE TABLE `work_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`work_order_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`sac_code` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`rate_paise` integer DEFAULT 0 NOT NULL,
	`amount_paise` integer DEFAULT 0 NOT NULL,
	`taxable` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_work_order_items_wo` ON `work_order_items` (`work_order_id`,`position`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`company_id` text NOT NULL,
	`deal_id` text,
	`project_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`number` text,
	`fy` text,
	`customer_ref` text,
	`requested_by` text,
	`department` text,
	`job_details` text,
	`comments` text,
	`issue_date` text,
	`completed_date` text,
	`place_of_supply` text DEFAULT '' NOT NULL,
	`tax_mode` text DEFAULT 'INTRA' NOT NULL,
	`rate_bps` integer DEFAULT 1800 NOT NULL,
	`subtotal_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer DEFAULT 0 NOT NULL,
	`issue_key` text,
	`snapshot_json` text,
	`issued_at` text,
	`cancelled_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_orders_org_status` ON `work_orders` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_work_orders_company` ON `work_orders` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_work_orders_org_number` ON `work_orders` (`org_id`,`number`);