CREATE TABLE `care_locations` (
	`id` varchar(36) NOT NULL,
	`patient_id` varchar(36) NOT NULL,
	`label` varchar(60) NOT NULL,
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`source` enum('CLIENT_PIN','STAFF','FROM_CHECKIN') NOT NULL,
	`is_default` boolean NOT NULL DEFAULT false,
	`confirmed_at` datetime,
	`confirmed_by` varchar(36),
	`from_shift_id` varchar(36),
	`created_by` varchar(36),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `care_locations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `care_location_id` varchar(36);--> statement-breakpoint
ALTER TABLE `check_in_settings` ADD `far_metres` int DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_checkins` ADD `in_distance_from` enum('PIN','EARLIER');--> statement-breakpoint
ALTER TABLE `shift_checkins` ADD `in_mocked` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `shift_checkins` ADD `out_distance_m` int;--> statement-breakpoint
ALTER TABLE `shift_checkins` ADD `out_mocked` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `care_locations_patient_idx` ON `care_locations` (`patient_id`,`is_default`);--> statement-breakpoint
UPDATE `shift_checkins` SET `in_distance_from` = 'EARLIER' WHERE `in_distance_m` IS NOT NULL AND `in_distance_from` IS NULL;
