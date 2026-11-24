import { sql, type SQL } from 'drizzle-orm';
import { skills } from '../database/schema';

type Lang = 'en' | 'si' | 'ta';

/**
 * A skill's name in the reader's language: the Sinhala or Tamil translation
 * when there is one, otherwise the English name. Every place that shows a
 * skill to a person goes through one of these two, so a translation an admin
 * has not filled in yet reads as English rather than as a blank.
 */
export function localSkillName(row: { name: string; nameSi?: string | null; nameTa?: string | null }, lang: Lang | string | undefined): string {
  const translated = lang === 'si' ? row.nameSi : lang === 'ta' ? row.nameTa : null;
  return translated?.trim() || row.name;
}

export function localSkillCategory(
  row: { category: string | null; categorySi?: string | null; categoryTa?: string | null },
  lang: Lang | string | undefined,
): string | null {
  const translated = lang === 'si' ? row.categorySi : lang === 'ta' ? row.categoryTa : null;
  return translated?.trim() || row.category;
}

/** The same rule as localSkillName, as a column expression for a select. */
export function skillNameSql(lang: Lang | string | undefined): SQL<string> {
  if (lang === 'si') return sql<string>`coalesce(nullif(trim(${skills.nameSi}), ''), ${skills.name})`;
  if (lang === 'ta') return sql<string>`coalesce(nullif(trim(${skills.nameTa}), ''), ${skills.name})`;
  return sql<string>`${skills.name}`;
}
