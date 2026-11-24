/**
 * Sinhala and Tamil for the standard skills and categories the reference seed
 * creates (seed-reference-data.ts). Migration 0056 writes the same text into
 * existing databases; admins can change any of it under Settings > Skills.
 * Keyed by the English text, which is the skill's identity.
 */
export const STANDARD_SKILL_TRANSLATIONS: Record<string, { si: string; ta: string }> = {
  'Insulin Administration': { si: 'ඉන්සියුලින් ලබා දීම', ta: 'இன்சுலின் செலுத்துதல்' },
  "Parkinson's Care": { si: 'පාකින්සන් රෝගීන්ගේ සත්කාරය', ta: 'பார்கின்சன் நோயாளர் பராமரிப்பு' },
  'Patient Meal Preparation': { si: 'රෝගීන් සඳහා ආහාර පිළියෙළ කිරීම', ta: 'நோயாளருக்கான உணவு தயாரித்தல்' },
  'Vital Signs Monitoring': { si: 'ජීව ලක්ෂණ නිරීක්ෂණය', ta: 'உயிர்க்குறிகள் கண்காணிப்பு' },
  'Blood Pressure Monitoring': { si: 'රුධිර පීඩනය නිරීක්ෂණය', ta: 'இரத்த அழுத்தக் கண்காணிப்பு' },
  'Blood Sugar Monitoring': { si: 'රුධිර සීනි මට්ටම නිරීක්ෂණය', ta: 'இரத்தச் சர்க்கரைக் கண்காணிப்பு' },
  'Catheter Care': { si: 'කැතීටර සත්කාරය', ta: 'வடிகுழாய் (கதீட்டர்) பராமரிப்பு' },
  'Tube Feeding': { si: 'නළයක් මඟින් ආහාර ලබා දීම', ta: 'குழாய் வழி உணவூட்டல்' },
  'Adult Diaper Changing': { si: 'වැඩිහිටි ඩයපර් මාරු කිරීම', ta: 'வயதானோருக்கு டயப்பர் மாற்றுதல்' },
  'Wound Care / Dressing': { si: 'තුවාල සත්කාරය / වෙළුම් බැඳීම', ta: 'காயப் பராமரிப்பு / கட்டுப்போடுதல்' },
  'Dementia Care': { si: 'ඩිමෙන්ශියා රෝගීන්ගේ සත්කාරය', ta: 'மறதிநோய் (டிமென்ஷியா) பராமரிப்பு' },
  'Physiotherapy Assistance': { si: 'භෞත චිකිත්සාවට සහාය', ta: 'இயன்முறை சிகிச்சைக்கு உதவி' },
  'Medication Assistance': { si: 'ඖෂධ ගැනීමට සහාය', ta: 'மருந்து உட்கொள்ள உதவி' },
  'Bathing Assistance': { si: 'ස්නානය කිරීමට සහාය', ta: 'குளிக்க உதவி' },
};

export const STANDARD_CATEGORY_TRANSLATIONS: Record<string, { si: string; ta: string }> = {
  Medical: { si: 'වෛද්‍ය', ta: 'மருத்துவம்' },
  'Specialized Care': { si: 'විශේෂිත සත්කාර', ta: 'சிறப்புப் பராமரிப்பு' },
  'Daily Living': { si: 'දෛනික ජීවිතය', ta: 'அன்றாட வாழ்க்கை' },
};
