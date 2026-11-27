ALTER TABLE `whatsapp_auth_settings` MODIFY COLUMN `template_name` varchar(128) NOT NULL DEFAULT 'pickcare_otp';--> statement-breakpoint
ALTER TABLE `whatsapp_auth_settings` MODIFY COLUMN `notification_template_name` varchar(128) NOT NULL DEFAULT 'pickcare_update';--> statement-breakpoint
ALTER TABLE `email_settings` MODIFY COLUMN `from_name` varchar(128) NOT NULL DEFAULT 'Pick Care';--> statement-breakpoint
ALTER TABLE `billing_settings` MODIFY COLUMN `business_name` varchar(200) NOT NULL DEFAULT 'Pick Care';--> statement-breakpoint
ALTER TABLE `branding_settings` MODIFY COLUMN `company_name` varchar(120) NOT NULL DEFAULT 'Pick Care';--> statement-breakpoint
ALTER TABLE `branding_settings` MODIFY COLUMN `short_name` varchar(4) NOT NULL DEFAULT 'PC';--> statement-breakpoint
ALTER TABLE `branding_settings` MODIFY COLUMN `primary_color` varchar(7) NOT NULL DEFAULT '#0F5C5C';--> statement-breakpoint
ALTER TABLE `branding_settings` MODIFY COLUMN `accent_color` varchar(7) NOT NULL DEFAULT '#BA5942';--> statement-breakpoint
UPDATE `branding_settings` SET `primary_color` = '#0F5C5C', `accent_color` = '#BA5942' WHERE `company_name` = 'CareLink' AND `primary_color` = '#5F6952' AND `accent_color` = '#2F7A84';--> statement-breakpoint
UPDATE `branding_settings` SET `short_name` = 'PC' WHERE `company_name` = 'CareLink' AND `short_name` = 'CL';--> statement-breakpoint
UPDATE `branding_settings` SET `company_name` = 'Pick Care' WHERE `company_name` = 'CareLink';--> statement-breakpoint
UPDATE `email_settings` SET `from_name` = 'Pick Care' WHERE `from_name` = 'CareLink';--> statement-breakpoint
UPDATE `billing_settings` SET `business_name` = 'Pick Care' WHERE `business_name` = 'CareLink';
