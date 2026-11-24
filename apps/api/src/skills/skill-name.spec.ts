import { localSkillCategory, localSkillName } from './skill-name';
import { STANDARD_CATEGORY_TRANSLATIONS, STANDARD_SKILL_TRANSLATIONS } from './skill-translations';

describe('localSkillName', () => {
  const row = { name: 'Tube Feeding', nameSi: 'නළයක් මඟින් ආහාර ලබා දීම', nameTa: null };

  it('uses the translation for the requested language', () => {
    expect(localSkillName(row, 'si')).toBe('නළයක් මඟින් ආහාර ලබා දීම');
  });

  it('falls back to English when a translation is missing or blank', () => {
    expect(localSkillName(row, 'ta')).toBe('Tube Feeding');
    expect(localSkillName({ ...row, nameSi: '   ' }, 'si')).toBe('Tube Feeding');
    expect(localSkillName(row, undefined)).toBe('Tube Feeding');
    expect(localSkillName(row, 'en')).toBe('Tube Feeding');
  });

  it('does the same for categories, keeping null as null', () => {
    expect(localSkillCategory({ category: 'Medical', categorySi: 'වෛද්‍ය', categoryTa: null }, 'si')).toBe('වෛද්‍ය');
    expect(localSkillCategory({ category: 'Medical', categorySi: null, categoryTa: null }, 'ta')).toBe('Medical');
    expect(localSkillCategory({ category: null }, 'si')).toBeNull();
  });
});

describe('standard skill translations', () => {
  it('has Sinhala and Tamil for every standard skill and category', () => {
    for (const t of [...Object.values(STANDARD_SKILL_TRANSLATIONS), ...Object.values(STANDARD_CATEGORY_TRANSLATIONS)]) {
      expect(t.si.trim()).not.toBe('');
      expect(t.ta.trim()).not.toBe('');
    }
  });
});
