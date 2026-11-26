ALTER TABLE `location_shares` MODIFY COLUMN `end_reason` enum('CHECKED_IN','STOPPED','SHIFT_ENDED','CANT_MAKE','CAP','CHECKED_OUT','TURNED_OFF','REPLACED');--> statement-breakpoint
ALTER TABLE `check_in_settings` ADD `presence_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `check_in_settings` ADD `presence_every_minutes` int DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `check_in_settings` ADD `presence_away_points` int DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `check_in_settings` ADD `presence_silent_multiplier` int DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `location_points` ADD `inside` boolean;--> statement-breakpoint
ALTER TABLE `location_points` ADD `distance_m` int;--> statement-breakpoint
ALTER TABLE `location_shares` ADD `away_asked_at` datetime;--> statement-breakpoint
ALTER TABLE `location_shares` ADD `away_reply` enum('WITH_CLIENT','OUT_FOR_CLIENT');--> statement-breakpoint
ALTER TABLE `location_shares` ADD `away_replied_at` datetime;--> statement-breakpoint
ALTER TABLE `location_shares` ADD `summary` json;