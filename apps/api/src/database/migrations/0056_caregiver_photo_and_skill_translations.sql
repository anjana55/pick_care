ALTER TABLE `caregivers` ADD `photo_key` varchar(255);--> statement-breakpoint
ALTER TABLE `caregivers` ADD `photo_mime_type` varchar(50);--> statement-breakpoint
ALTER TABLE `caregivers` ADD `photo_updated_at` datetime;--> statement-breakpoint
ALTER TABLE `caregivers` ADD `pending_photo_key` varchar(255);--> statement-breakpoint
ALTER TABLE `caregivers` ADD `pending_photo_mime_type` varchar(50);--> statement-breakpoint
ALTER TABLE `caregivers` ADD `pending_photo_at` datetime;--> statement-breakpoint
ALTER TABLE `caregivers` ADD `photo_rejected_at` datetime;--> statement-breakpoint
ALTER TABLE `caregivers` ADD `photo_rejection_reason` varchar(500);--> statement-breakpoint
ALTER TABLE `skills` ADD `name_si` varchar(150);--> statement-breakpoint
ALTER TABLE `skills` ADD `name_ta` varchar(150);--> statement-breakpoint
ALTER TABLE `skills` ADD `category_si` varchar(100);--> statement-breakpoint
ALTER TABLE `skills` ADD `category_ta` varchar(100);--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'ඉන්සියුලින් ලබා දීම', `name_ta` = 'இன்சுலின் செலுத்துதல்' WHERE `name` = 'Insulin Administration' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'පාකින්සන් රෝගීන්ගේ සත්කාරය', `name_ta` = 'பார்கின்சன் நோயாளர் பராமரிப்பு' WHERE `name` = 'Parkinson''s Care' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'රෝගීන් සඳහා ආහාර පිළියෙළ කිරීම', `name_ta` = 'நோயாளருக்கான உணவு தயாரித்தல்' WHERE `name` = 'Patient Meal Preparation' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'ජීව ලක්ෂණ නිරීක්ෂණය', `name_ta` = 'உயிர்க்குறிகள் கண்காணிப்பு' WHERE `name` = 'Vital Signs Monitoring' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'රුධිර පීඩනය නිරීක්ෂණය', `name_ta` = 'இரத்த அழுத்தக் கண்காணிப்பு' WHERE `name` = 'Blood Pressure Monitoring' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'රුධිර සීනි මට්ටම නිරීක්ෂණය', `name_ta` = 'இரத்தச் சர்க்கரைக் கண்காணிப்பு' WHERE `name` = 'Blood Sugar Monitoring' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'කැතීටර සත්කාරය', `name_ta` = 'வடிகுழாய் (கதீட்டர்) பராமரிப்பு' WHERE `name` = 'Catheter Care' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'නළයක් මඟින් ආහාර ලබා දීම', `name_ta` = 'குழாய் வழி உணவூட்டல்' WHERE `name` = 'Tube Feeding' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'වැඩිහිටි ඩයපර් මාරු කිරීම', `name_ta` = 'வயதானோருக்கு டயப்பர் மாற்றுதல்' WHERE `name` = 'Adult Diaper Changing' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'තුවාල සත්කාරය / වෙළුම් බැඳීම', `name_ta` = 'காயப் பராமரிப்பு / கட்டுப்போடுதல்' WHERE `name` = 'Wound Care / Dressing' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'ඩිමෙන්ශියා රෝගීන්ගේ සත්කාරය', `name_ta` = 'மறதிநோய் (டிமென்ஷியா) பராமரிப்பு' WHERE `name` = 'Dementia Care' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'භෞත චිකිත්සාවට සහාය', `name_ta` = 'இயன்முறை சிகிச்சைக்கு உதவி' WHERE `name` = 'Physiotherapy Assistance' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'ඖෂධ ගැනීමට සහාය', `name_ta` = 'மருந்து உட்கொள்ள உதவி' WHERE `name` = 'Medication Assistance' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `name_si` = 'ස්නානය කිරීමට සහාය', `name_ta` = 'குளிக்க உதவி' WHERE `name` = 'Bathing Assistance' AND `name_si` IS NULL AND `name_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `category_si` = 'වෛද්‍ය', `category_ta` = 'மருத்துவம்' WHERE `category` = 'Medical' AND `category_si` IS NULL AND `category_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `category_si` = 'විශේෂිත සත්කාර', `category_ta` = 'சிறப்புப் பராமரிப்பு' WHERE `category` = 'Specialized Care' AND `category_si` IS NULL AND `category_ta` IS NULL;--> statement-breakpoint
UPDATE `skills` SET `category_si` = 'දෛනික ජීවිතය', `category_ta` = 'அன்றாட வாழ்க்கை' WHERE `category` = 'Daily Living' AND `category_si` IS NULL AND `category_ta` IS NULL;
