-- Legacy rows used CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS', UTC). All new writes use ISO 8601.
-- Normalise old rows once so ordering and comparisons are consistent. Safe to re-run.

UPDATE `clients` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) WHERE `created_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `clients` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) WHERE `updated_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `projects` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) WHERE `created_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `projects` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) WHERE `updated_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `tasks` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) WHERE `created_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `tasks` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) WHERE `updated_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `activity_logs` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) WHERE `created_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `automation_rules` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) WHERE `created_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `automation_rules` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) WHERE `updated_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `pipeline_items` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) WHERE `created_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `pipeline_items` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) WHERE `updated_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `social_entries` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) WHERE `created_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `social_entries` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) WHERE `updated_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `freelancers` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) WHERE `created_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `freelancers` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) WHERE `updated_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) IS NOT NULL;
--> statement-breakpoint
UPDATE `org_settings` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) WHERE `updated_at` NOT LIKE '%T%' AND strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`) IS NOT NULL;
