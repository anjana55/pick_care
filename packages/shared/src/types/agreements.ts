import type { Locale } from './locale';
import type { SignupSide } from './signup';

/**
 * The service agreements a new client and a new caregiver accept when they
 * register - shown in full on the website (/agreements/client,
 * /agreements/caregiver) and in the app, and recorded against the account
 * with the version accepted (agreement_acceptances).
 *
 * DRAFT WORDING. The English is a plain-language starting point written for
 * this platform, not legal advice; it needs review by the business (and its
 * lawyer) before go-live. The Sinhala and Tamil are drafts of that English
 * and need the same review by the translators who did the rest of the app
 * (i18n-review/). Change the text, then bump the version: everyone who
 * registers after that accepts the new version, and the API refuses a
 * registration that accepted an older one, so nobody signs up against text
 * they were not shown.
 *
 * `{brand}` is replaced with the company name from Settings > Branding.
 */

export interface AgreementSection {
  heading: string;
  body: string;
}

export interface AgreementText {
  title: string;
  intro: string;
  sections: AgreementSection[];
  /** The sentence beside the tick box on the registration form. */
  acceptLabel: string;
}

export interface ServiceAgreement {
  /** Recorded with every acceptance. Bump it whenever the wording changes. */
  version: string;
  text: Record<Locale, AgreementText>;
}

const CLIENT_EN: AgreementText = {
  title: '{brand} client service agreement',
  intro:
    'This agreement is between you and {brand}. It explains what we do for you and what we ask of you when you use {brand} to find and book a caregiver. Please read it before you register.',
  sections: [
    {
      heading: 'What we do',
      body: 'We help you find a caregiver who suits your needs, arrange the visits or shifts you book, and stay in touch with you and the caregiver while the care goes on. Our office is there to help whenever something needs to change.',
    },
    {
      heading: 'The information you give us',
      body: 'Please give us true and complete information about the person who needs care, their health and the help they need, and keep it up to date. We share it only with the caregivers and staff who need it to look after that person.',
    },
    {
      heading: 'Bookings and payment',
      body: 'The price and times of the care are agreed with you before a booking is confirmed. You agree to pay each invoice for the care you received by the date shown on it, using one of the payment methods we offer.',
    },
    {
      heading: 'Changes and cancellations',
      body: 'If you need to change or cancel a booking, tell us as early as you can. A cancellation made at short notice may be charged as set out in your booking.',
    },
    {
      heading: 'Safety and respect',
      body: 'Please treat caregivers with respect, keep the place where care is given safe, and tell us straight away about any accident, emergency or concern. Do not make private arrangements with a caregiver you met through {brand} without telling us.',
    },
    {
      heading: 'Your privacy',
      body: 'We keep your personal information safe and use it only to provide and improve our service. You can ask us to correct it, and you can delete your account at any time from your account settings.',
    },
    {
      heading: 'Changes to this agreement',
      body: 'If we change this agreement we will tell you before the change applies. You can contact our office at any time with a question or a complaint.',
    },
  ],
  acceptLabel: 'I have read and agree to the client service agreement',
};

const CLIENT_SI: AgreementText = {
  title: '{brand} සේවාලාභී සේවා ගිවිසුම',
  intro:
    'මෙම ගිවිසුම ඔබ සහ {brand} අතර වේ. සාත්තු සේවකයෙකු සොයා වෙන් කර ගැනීමට ඔබ {brand} භාවිතා කරන විට අප ඔබ වෙනුවෙන් කරන දේ සහ අප ඔබෙන් ඉල්ලා සිටින දේ එහි පැහැදිලි කරයි. ලියාපදිංචි වීමට පෙර කරුණාකර එය කියවන්න.',
  sections: [
    {
      heading: 'අප කරන දේ',
      body: 'ඔබේ අවශ්‍යතාවලට ගැළපෙන සාත්තු සේවකයෙකු සොයා ගැනීමට, ඔබ වෙන් කරන පැමිණීම් හෝ මුර සංවිධානය කිරීමට, සහ රැකවරණය පවතින කාලය පුරා ඔබ සහ සාත්තු සේවකයා සමඟ සම්බන්ධව සිටීමට අපි උදව් කරමු. යමක් වෙනස් කිරීමට අවශ්‍ය ඕනෑම විටෙක අපගේ කාර්යාලය උදව් කිරීමට සූදානම්.',
    },
    {
      heading: 'ඔබ අපට ලබා දෙන තොරතුරු',
      body: 'රැකවරණය අවශ්‍ය පුද්ගලයා, ඔවුන්ගේ සෞඛ්‍යය සහ ඔවුන්ට අවශ්‍ය උදව් පිළිබඳව සත්‍ය හා සම්පූර්ණ තොරතුරු ලබා දී, ඒවා යාවත්කාලීනව තබා ගන්න. එම පුද්ගලයා රැක බලා ගැනීමට එම තොරතුරු අවශ්‍ය සාත්තු සේවකයින් හා කාර්ය මණ්ඩලය සමඟ පමණක් අපි ඒවා බෙදා ගනිමු.',
    },
    {
      heading: 'වෙන් කිරීම් සහ ගෙවීම්',
      body: 'වෙන් කිරීමක් තහවුරු කිරීමට පෙර රැකවරණයේ මිල සහ වේලාවන් ඔබ සමඟ එකඟ වේ. ඔබට ලැබුණු රැකවරණය සඳහා වන සෑම ඉන්වොයිසියක්ම එහි සඳහන් දිනයට පෙර, අප පිරිනමන ගෙවීම් ක්‍රමයකින් ගෙවීමට ඔබ එකඟ වේ.',
    },
    {
      heading: 'වෙනස් කිරීම් සහ අවලංගු කිරීම්',
      body: 'වෙන් කිරීමක් වෙනස් කිරීමට හෝ අවලංගු කිරීමට අවශ්‍ය නම්, හැකි ඉක්මනින් අපට දන්වන්න. කෙටි දැනුම්දීමකින් කරන අවලංගු කිරීමක් සඳහා ඔබේ වෙන් කිරීමේ සඳහන් පරිදි ගාස්තුවක් අය කළ හැක.',
    },
    {
      heading: 'ආරක්ෂාව සහ ගෞරවය',
      body: 'කරුණාකර සාත්තු සේවකයින්ට ගෞරවයෙන් සලකන්න, රැකවරණය දෙන ස්ථානය ආරක්ෂිතව තබා ගන්න, සහ ඕනෑම අනතුරක්, හදිසි අවස්ථාවක් හෝ ගැටලුවක් ගැන වහාම අපට දන්වන්න. {brand} හරහා හමු වූ සාත්තු සේවකයෙකු සමඟ අපට නොදන්වා පෞද්ගලික එකඟතා ඇති කර නොගන්න.',
    },
    {
      heading: 'ඔබේ පෞද්ගලිකත්වය',
      body: 'අපි ඔබේ පෞද්ගලික තොරතුරු ආරක්ෂිතව තබා, අපගේ සේවාව සැපයීමට හා වැඩිදියුණු කිරීමට පමණක් භාවිතා කරමු. ඒවා නිවැරදි කරන ලෙස ඔබට ඉල්ලා සිටිය හැකි අතර, ඔබේ ගිණුම් සැකසුම් වලින් ඕනෑම විටෙක ඔබේ ගිණුම මකා දැමිය හැක.',
    },
    {
      heading: 'මෙම ගිවිසුමේ වෙනස්කම්',
      body: 'අපි මෙම ගිවිසුම වෙනස් කරන්නේ නම්, එම වෙනස බලපැවැත්වීමට පෙර ඔබට දන්වන්නෙමු. ප්‍රශ්නයක් හෝ පැමිණිල්ලක් සඳහා ඕනෑම විටෙක අපගේ කාර්යාලය අමතන්න.',
    },
  ],
  acceptLabel: 'මම සේවාලාභී සේවා ගිවිසුම කියවා එයට එකඟ වෙමි',
};

const CLIENT_TA: AgreementText = {
  title: '{brand} வாடிக்கையாளர் சேவை ஒப்பந்தம்',
  intro:
    'இந்த ஒப்பந்தம் உங்களுக்கும் {brand} க்கும் இடையிலானது. ஒரு பராமரிப்பாளரைக் கண்டறிந்து முன்பதிவு செய்ய நீங்கள் {brand} ஐப் பயன்படுத்தும்போது நாங்கள் உங்களுக்காகச் செய்வதையும், நாங்கள் உங்களிடம் கேட்பதையும் இது விளக்குகிறது. பதிவு செய்வதற்கு முன் இதைப் படிக்கவும்.',
  sections: [
    {
      heading: 'நாங்கள் செய்வது',
      body: 'உங்கள் தேவைகளுக்குப் பொருத்தமான பராமரிப்பாளரைக் கண்டறியவும், நீங்கள் முன்பதிவு செய்யும் வருகைகள் அல்லது பணிநேரங்களை ஏற்பாடு செய்யவும், பராமரிப்பு நடைபெறும் காலம் முழுவதும் உங்களுடனும் பராமரிப்பாளருடனும் தொடர்பில் இருக்கவும் நாங்கள் உதவுகிறோம். ஏதேனும் மாற்ற வேண்டியிருந்தால் எங்கள் அலுவலகம் எப்போதும் உதவத் தயாராக உள்ளது.',
    },
    {
      heading: 'நீங்கள் வழங்கும் தகவல்',
      body: 'பராமரிப்பு தேவைப்படும் நபர், அவரது உடல்நலம் மற்றும் அவருக்குத் தேவையான உதவி பற்றி உண்மையான, முழுமையான தகவலை வழங்கி, அதைப் புதுப்பித்து வைத்திருக்கவும். அந்த நபரைக் கவனிக்க அது தேவைப்படும் பராமரிப்பாளர்கள் மற்றும் ஊழியர்களுடன் மட்டுமே நாங்கள் அதைப் பகிர்கிறோம்.',
    },
    {
      heading: 'முன்பதிவுகளும் கட்டணமும்',
      body: 'ஒரு முன்பதிவு உறுதிசெய்யப்படுவதற்கு முன் பராமரிப்பின் விலையும் நேரங்களும் உங்களுடன் ஒப்புக்கொள்ளப்படும். நீங்கள் பெற்ற பராமரிப்புக்கான ஒவ்வொரு விலைப்பட்டியலையும் அதில் குறிப்பிட்ட திகதிக்குள், நாங்கள் வழங்கும் கட்டண முறைகளில் ஒன்றின் மூலம் செலுத்த நீங்கள் ஒப்புக்கொள்கிறீர்கள்.',
    },
    {
      heading: 'மாற்றங்களும் இரத்துசெய்தல்களும்',
      body: 'ஒரு முன்பதிவை மாற்றவோ இரத்துசெய்யவோ வேண்டுமானால், முடிந்தவரை விரைவில் எங்களுக்குத் தெரிவிக்கவும். குறுகிய அறிவிப்பில் செய்யப்படும் இரத்துசெய்தலுக்கு உங்கள் முன்பதிவில் குறிப்பிட்டபடி கட்டணம் விதிக்கப்படலாம்.',
    },
    {
      heading: 'பாதுகாப்பும் மரியாதையும்',
      body: 'பராமரிப்பாளர்களை மரியாதையுடன் நடத்தவும், பராமரிப்பு வழங்கப்படும் இடத்தைப் பாதுகாப்பாக வைத்திருக்கவும், எந்தவொரு விபத்து, அவசரநிலை அல்லது கவலையைப் பற்றியும் உடனடியாக எங்களுக்குத் தெரிவிக்கவும். {brand} மூலம் சந்தித்த ஒரு பராமரிப்பாளருடன் எங்களுக்குத் தெரிவிக்காமல் தனிப்பட்ட ஏற்பாடுகளைச் செய்ய வேண்டாம்.',
    },
    {
      heading: 'உங்கள் தனியுரிமை',
      body: 'உங்கள் தனிப்பட்ட தகவலைப் பாதுகாப்பாக வைத்து, எங்கள் சேவையை வழங்கவும் மேம்படுத்தவும் மட்டுமே பயன்படுத்துகிறோம். அதைத் திருத்துமாறு நீங்கள் கேட்கலாம், உங்கள் கணக்கு அமைப்புகளில் இருந்து எப்போது வேண்டுமானாலும் உங்கள் கணக்கை நீக்கலாம்.',
    },
    {
      heading: 'இந்த ஒப்பந்தத்தில் மாற்றங்கள்',
      body: 'இந்த ஒப்பந்தத்தை நாங்கள் மாற்றினால், அந்த மாற்றம் நடைமுறைக்கு வருவதற்கு முன் உங்களுக்குத் தெரிவிப்போம். கேள்வி அல்லது புகார் இருந்தால் எப்போது வேண்டுமானாலும் எங்கள் அலுவலகத்தைத் தொடர்புகொள்ளவும்.',
    },
  ],
  acceptLabel: 'வாடிக்கையாளர் சேவை ஒப்பந்தத்தைப் படித்து அதற்கு ஒப்புக்கொள்கிறேன்',
};

const CAREGIVER_EN: AgreementText = {
  title: '{brand} caregiver service agreement',
  intro:
    'This agreement is between you and {brand}. It explains how we work together when you offer care to clients through {brand}. Please read it before you register.',
  sections: [
    {
      heading: 'Your information and documents',
      body: 'Give us true and complete information about yourself, your training and your work history, and keep it up to date. You agree that we may check your documents and references before you are offered work, and from time to time afterwards.',
    },
    {
      heading: 'Looking after clients',
      body: 'Arrive on time, check in and out of each shift as the app asks, follow the care plan, and treat every client with kindness, dignity and respect. Never ask a client for money, gifts or loans.',
    },
    {
      heading: 'Confidentiality',
      body: "Keep everything you learn about a client and their family private. Do not share it, or photographs of them or their home, with anyone outside {brand}'s care team.",
    },
    {
      heading: 'Offers and shifts',
      body: 'You are free to accept or decline the work we offer. Once you accept a shift, tell the office as early as you can if you cannot make it, so the client is not left without care.',
    },
    {
      heading: 'Your location during visits',
      body: 'If you tap "On my way" before a visit, the client and the office see where you are and about how long until you arrive, until you check in. While you are checked in, the app may check your location at set times (for example every 30 minutes) and share it with the office only. This is only ever during a shift you started from the app; a notification shows while it runs, and you can stop it. It is used for the safety and quality of visits, never for ratings or search, and the points are deleted after a set number of days.',
    },
    {
      heading: 'Payment',
      body: 'You are paid for the shifts you complete at the rate agreed when you accepted them, on the dates and in the way the office tells you.',
    },
    {
      heading: 'Safety',
      body: 'Report any accident, injury, emergency or concern about a client to the office straight away. In an emergency, call for help first. Do not make private arrangements with a client you met through {brand} without telling us.',
    },
    {
      heading: 'If things go wrong',
      body: 'If this agreement is not kept, we may pause or close your account after talking to you about it.',
    },
    {
      heading: 'Your privacy and changes',
      body: 'We keep your personal information safe and use it only to run our service. If we change this agreement we will tell you before the change applies. You can contact the office at any time.',
    },
  ],
  acceptLabel: 'I have read and agree to the caregiver service agreement',
};

const CAREGIVER_SI: AgreementText = {
  title: '{brand} සාත්තු සේවක සේවා ගිවිසුම',
  intro: 'මෙම ගිවිසුම ඔබ සහ {brand} අතර වේ. ඔබ {brand} හරහා සේවාලාභීන්ට රැකවරණය ලබා දෙන විට අප එකට වැඩ කරන ආකාරය එහි පැහැදිලි කරයි. ලියාපදිංචි වීමට පෙර කරුණාකර එය කියවන්න.',
  sections: [
    {
      heading: 'ඔබේ තොරතුරු සහ ලේඛන',
      body: 'ඔබ, ඔබේ පුහුණුව සහ ඔබේ සේවා ඉතිහාසය පිළිබඳව සත්‍ය හා සම්පූර්ණ තොරතුරු ලබා දී, ඒවා යාවත්කාලීනව තබා ගන්න. ඔබට වැඩ පිරිනැමීමට පෙර සහ ඉන් පසුවද වරින් වර, ඔබේ ලේඛන සහ නිර්දේශකයින් පරීක්ෂා කිරීමට ඔබ එකඟ වේ.',
    },
    {
      heading: 'සේවාලාභීන් රැක බලා ගැනීම',
      body: 'වේලාවට පැමිණෙන්න, යෙදුම ඉල්ලා සිටින පරිදි සෑම මුරයකටම පැමිණීම සහ පිටවීම සටහන් කරන්න, රැකවරණ සැලැස්ම අනුගමනය කරන්න, සහ සෑම සේවාලාභියෙකුටම කරුණාවෙන්, ගෞරවයෙන් සලකන්න. සේවාලාභියෙකුගෙන් කිසිවිටෙක මුදල්, තෑගි හෝ ණය ඉල්ලන්න එපා.',
    },
    {
      heading: 'රහස්‍යභාවය',
      body: 'සේවාලාභියෙකු සහ ඔවුන්ගේ පවුල ගැන ඔබ දැනගන්නා සියල්ල රහසිගතව තබා ගන්න. එම තොරතුරු හෝ ඔවුන්ගේ හෝ ඔවුන්ගේ නිවසේ ඡායාරූප {brand} රැකවරණ කණ්ඩායමෙන් පිටත කිසිවෙකු සමඟ බෙදා නොගන්න.',
    },
    {
      heading: 'වැඩ පිරිනැමීම් සහ මුර',
      body: 'අප පිරිනමන වැඩ භාර ගැනීමට හෝ ප්‍රතික්ෂේප කිරීමට ඔබට නිදහස ඇත. මුරයක් භාර ගත් පසු, ඔබට එයට සහභාගී විය නොහැකි නම්, සේවාලාභියා රැකවරණයකින් තොරව නොසිටින ලෙස හැකි ඉක්මනින් කාර්යාලයට දන්වන්න.',
    },
    {
      heading: 'පැමිණීම් අතරතුර ඔබගේ ස්ථානය',
      body: 'පැමිණීමකට පෙර ඔබ "මම එනවා" තට්ටු කළහොත්, ඔබ පැමිණීම සටහන් කරන තුරු ඔබ සිටින ස්ථානය සහ ඔබ පැමිණීමට ආසන්න කාලය සේවාලාභියාට සහ කාර්යාලයට පෙනේ. ඔබ පැමිණීම සටහන් කර සිටින අතරතුර, යෙදුම නියමිත වේලාවන්හිදී (උදාහරණයක් ලෙස සෑම මිනිත්තු 30 කට වරක්) ඔබගේ ස්ථානය පරීක්ෂා කර එය කාර්යාලය සමඟ පමණක් බෙදා ගත හැක. මෙය සිදු වන්නේ ඔබ යෙදුමෙන් ආරම්භ කළ සේවා මුරයක් අතරතුර පමණි; එය ක්‍රියාත්මක වන අතරතුර දැනුම්දීමක් පෙන්වන අතර, ඔබට එය නැවැත්විය හැක. එය පැමිණීම්වල ආරක්ෂාව සහ ගුණාත්මකභාවය සඳහා පමණක් භාවිතා වේ, ශ්‍රේණිගත කිරීම් හෝ සෙවීම සඳහා කිසිවිටෙක නොවේ, සහ ස්ථාන සටහන් නියමිත දින ගණනකට පසු මකා දමනු ලැබේ.',
    },
    {
      heading: 'ගෙවීම්',
      body: 'ඔබ සම්පූර්ණ කරන මුර සඳහා, ඒවා භාර ගත් විට එකඟ වූ ගාස්තුවට, කාර්යාලය දන්වන දිනවල සහ ආකාරයට ඔබට ගෙවනු ලැබේ.',
    },
    {
      heading: 'ආරක්ෂාව',
      body: 'ඕනෑම අනතුරක්, තුවාලයක්, හදිසි අවස්ථාවක් හෝ සේවාලාභියෙකු පිළිබඳ ගැටලුවක් වහාම කාර්යාලයට දන්වන්න. හදිසි අවස්ථාවකදී මුලින්ම උදව් කැඳවන්න. {brand} හරහා හමු වූ සේවාලාභියෙකු සමඟ අපට නොදන්වා පෞද්ගලික එකඟතා ඇති කර නොගන්න.',
    },
    {
      heading: 'ගැටලු ඇති වුවහොත්',
      body: 'මෙම ගිවිසුම රැකීමට අපොහොසත් වුවහොත්, ඒ ගැන ඔබ සමඟ කතා කිරීමෙන් පසු අපට ඔබේ ගිණුම තාවකාලිකව නතර කිරීමට හෝ වසා දැමීමට හැක.',
    },
    {
      heading: 'ඔබේ පෞද්ගලිකත්වය සහ වෙනස්කම්',
      body: 'අපි ඔබේ පෞද්ගලික තොරතුරු ආරක්ෂිතව තබා, අපගේ සේවාව පවත්වාගෙන යාමට පමණක් භාවිතා කරමු. අපි මෙම ගිවිසුම වෙනස් කරන්නේ නම්, එම වෙනස බලපැවැත්වීමට පෙර ඔබට දන්වන්නෙමු. ඕනෑම විටෙක කාර්යාලය ඇමතිය හැක.',
    },
  ],
  acceptLabel: 'මම සාත්තු සේවක සේවා ගිවිසුම කියවා එයට එකඟ වෙමි',
};

const CAREGIVER_TA: AgreementText = {
  title: '{brand} பராமரிப்பாளர் சேவை ஒப்பந்தம்',
  intro:
    'இந்த ஒப்பந்தம் உங்களுக்கும் {brand} க்கும் இடையிலானது. {brand} மூலம் நீங்கள் வாடிக்கையாளர்களுக்குப் பராமரிப்பு வழங்கும்போது நாம் எவ்வாறு இணைந்து செயல்படுகிறோம் என்பதை இது விளக்குகிறது. பதிவு செய்வதற்கு முன் இதைப் படிக்கவும்.',
  sections: [
    {
      heading: 'உங்கள் தகவலும் ஆவணங்களும்',
      body: 'உங்களைப் பற்றியும், உங்கள் பயிற்சி மற்றும் பணி வரலாறு பற்றியும் உண்மையான, முழுமையான தகவலை வழங்கி, அதைப் புதுப்பித்து வைத்திருக்கவும். உங்களுக்கு வேலை வழங்கப்படுவதற்கு முன்பும், அதன் பின்னர் அவ்வப்போதும் உங்கள் ஆவணங்களையும் பரிந்துரையாளர்களையும் நாங்கள் சரிபார்க்க நீங்கள் ஒப்புக்கொள்கிறீர்கள்.',
    },
    {
      heading: 'வாடிக்கையாளர்களைக் கவனித்தல்',
      body: 'நேரத்திற்கு வரவும், செயலி கேட்கும்படி ஒவ்வொரு பணிநேரத்திலும் வருகையையும் புறப்பாட்டையும் பதிவு செய்யவும், பராமரிப்புத் திட்டத்தைப் பின்பற்றவும், ஒவ்வொரு வாடிக்கையாளரையும் அன்புடனும் கண்ணியத்துடனும் மரியாதையுடனும் நடத்தவும். ஒரு வாடிக்கையாளரிடம் ஒருபோதும் பணம், பரிசுகள் அல்லது கடன் கேட்க வேண்டாம்.',
    },
    {
      heading: 'இரகசியத்தன்மை',
      body: 'ஒரு வாடிக்கையாளர் மற்றும் அவரது குடும்பம் பற்றி நீங்கள் அறிந்த அனைத்தையும் இரகசியமாக வைத்திருக்கவும். அதையோ, அவர்களின் அல்லது அவர்களின் வீட்டின் புகைப்படங்களையோ {brand} பராமரிப்புக் குழுவிற்கு வெளியே யாருடனும் பகிர வேண்டாம்.',
    },
    {
      heading: 'வேலை வாய்ப்புகளும் பணிநேரங்களும்',
      body: 'நாங்கள் வழங்கும் வேலையை ஏற்கவோ மறுக்கவோ உங்களுக்குச் சுதந்திரம் உண்டு. ஒரு பணிநேரத்தை ஏற்றுக்கொண்ட பின் உங்களால் வர முடியாவிட்டால், வாடிக்கையாளர் பராமரிப்பின்றி விடப்படாமல் இருக்க முடிந்தவரை விரைவில் அலுவலகத்திற்குத் தெரிவிக்கவும்.',
    },
    {
      heading: 'வருகைகளின்போது உங்கள் இருப்பிடம்',
      body: 'வருகைக்கு முன் நீங்கள் "வருகிறேன்" என்பதைத் தட்டினால், நீங்கள் வருகையைப் பதிவுசெய்யும் வரை நீங்கள் எங்கே இருக்கிறீர்கள், வந்துசேர ஏறக்குறைய எவ்வளவு நேரம் என்பதை வாடிக்கையாளரும் அலுவலகமும் பார்ப்பார்கள். நீங்கள் வருகையைப் பதிவுசெய்திருக்கும்போது, செயலி குறிப்பிட்ட நேரங்களில் (உதாரணமாக ஒவ்வொரு 30 நிமிடங்களுக்கும்) உங்கள் இருப்பிடத்தைச் சரிபார்த்து அலுவலகத்துடன் மட்டும் பகிரலாம். இது நீங்கள் செயலியிலிருந்து தொடங்கிய பணியின்போது மட்டுமே நடக்கும்; இது இயங்கும்போது ஓர் அறிவிப்பு காட்டப்படும், நீங்கள் அதை நிறுத்தலாம். இது வருகைகளின் பாதுகாப்புக்கும் தரத்துக்கும் மட்டுமே பயன்படுகிறது, மதிப்பீடுகளுக்கோ தேடலுக்கோ ஒருபோதும் அல்ல, மேலும் இருப்பிடப் புள்ளிகள் குறிப்பிட்ட நாட்களுக்குப் பிறகு நீக்கப்படும்.',
    },
    {
      heading: 'கட்டணம்',
      body: 'நீங்கள் நிறைவு செய்யும் பணிநேரங்களுக்கு, அவற்றை ஏற்றுக்கொண்டபோது ஒப்புக்கொண்ட விகிதத்தில், அலுவலகம் தெரிவிக்கும் திகதிகளிலும் முறையிலும் உங்களுக்குக் கட்டணம் செலுத்தப்படும்.',
    },
    {
      heading: 'பாதுகாப்பு',
      body: 'எந்தவொரு விபத்து, காயம், அவசரநிலை அல்லது வாடிக்கையாளர் பற்றிய கவலையையும் உடனடியாக அலுவலகத்திற்குத் தெரிவிக்கவும். அவசரநிலையில் முதலில் உதவிக்கு அழைக்கவும். {brand} மூலம் சந்தித்த ஒரு வாடிக்கையாளருடன் எங்களுக்குத் தெரிவிக்காமல் தனிப்பட்ட ஏற்பாடுகளைச் செய்ய வேண்டாம்.',
    },
    {
      heading: 'சிக்கல் ஏற்பட்டால்',
      body: 'இந்த ஒப்பந்தம் கடைப்பிடிக்கப்படாவிட்டால், அதைப் பற்றி உங்களுடன் பேசிய பின் உங்கள் கணக்கை இடைநிறுத்தவோ மூடவோ நாங்கள் செய்யலாம்.',
    },
    {
      heading: 'உங்கள் தனியுரிமையும் மாற்றங்களும்',
      body: 'உங்கள் தனிப்பட்ட தகவலைப் பாதுகாப்பாக வைத்து, எங்கள் சேவையை நடத்த மட்டுமே பயன்படுத்துகிறோம். இந்த ஒப்பந்தத்தை நாங்கள் மாற்றினால், அந்த மாற்றம் நடைமுறைக்கு வருவதற்கு முன் உங்களுக்குத் தெரிவிப்போம். எப்போது வேண்டுமானாலும் அலுவலகத்தைத் தொடர்புகொள்ளலாம்.',
    },
  ],
  acceptLabel: 'பராமரிப்பாளர் சேவை ஒப்பந்தத்தைப் படித்து அதற்கு ஒப்புக்கொள்கிறேன்',
};

export const SERVICE_AGREEMENTS: Record<SignupSide, ServiceAgreement> = {
  client: { version: '2026-11-22', text: { en: CLIENT_EN, si: CLIENT_SI, ta: CLIENT_TA } },
  caregiver: { version: '2026-11-26', text: { en: CAREGIVER_EN, si: CAREGIVER_SI, ta: CAREGIVER_TA } },
};

/** The current version of a side's agreement - what a registration must say it accepted. */
export const agreementVersion = (side: SignupSide): string => SERVICE_AGREEMENTS[side].version;

/** A side's agreement in a language, with the company name filled in. */
export function agreementText(side: SignupSide, locale: Locale, brand: string): AgreementText {
  const text = SERVICE_AGREEMENTS[side].text[locale] ?? SERVICE_AGREEMENTS[side].text.en;
  const fill = (s: string) => s.split('{brand}').join(brand);
  return {
    title: fill(text.title),
    intro: fill(text.intro),
    acceptLabel: fill(text.acceptLabel),
    sections: text.sections.map((s) => ({ heading: fill(s.heading), body: fill(s.body) })),
  };
}
