CREATE TABLE `location_notices` (
	`shift_id` varchar(36) NOT NULL,
	`kind` enum('ON_MY_WAY_REMINDER','CLIENT_ON_THE_WAY') NOT NULL,
	`sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `location_notices_shift_id_kind_pk` PRIMARY KEY(`shift_id`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `location_points` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`share_id` varchar(36) NOT NULL,
	`at` datetime NOT NULL,
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`accuracy_m` int,
	`speed` decimal(6,1),
	`mocked` boolean NOT NULL DEFAULT false,
	`received_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `location_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `location_shares` (
	`id` varchar(36) NOT NULL,
	`kind` enum('ON_THE_WAY','ON_SHIFT') NOT NULL,
	`shift_id` varchar(36) NOT NULL,
	`booking_id` varchar(36) NOT NULL,
	`caregiver_id` varchar(36) NOT NULL,
	`upload_token_hash` varchar(64) NOT NULL,
	`started_at` datetime NOT NULL,
	`ends_by` datetime NOT NULL,
	`ended_at` datetime,
	`end_reason` enum('CHECKED_IN','STOPPED','SHIFT_ENDED','CANT_MAKE','CAP','CHECKED_OUT','TURNED_OFF'),
	`every_minutes` int,
	`last_latitude` decimal(9,6),
	`last_longitude` decimal(9,6),
	`last_accuracy_m` int,
	`last_mocked` boolean NOT NULL DEFAULT false,
	`last_at` datetime,
	`last_distance_m` int,
	`points` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `location_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `check_in_settings` ADD `live_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `check_in_settings` ADD `on_my_way_minutes` int DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `check_in_settings` ADD `location_retention_days` int DEFAULT 30 NOT NULL;--> statement-breakpoint
CREATE INDEX `location_points_share_idx` ON `location_points` (`share_id`,`at`);--> statement-breakpoint
CREATE INDEX `location_points_at_idx` ON `location_points` (`at`);--> statement-breakpoint
CREATE INDEX `location_shares_shift_idx` ON `location_shares` (`shift_id`,`kind`);--> statement-breakpoint
CREATE INDEX `location_shares_open_idx` ON `location_shares` (`ended_at`,`ends_by`);