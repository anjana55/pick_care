import { mysqlTable, varchar, text, int, datetime, mysqlEnum, index, primaryKey } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const proficiencyLevelEnum = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;

/**
 * A skill caregivers are matched on. `name` / `category` are the English
 * text and the identity (unique, matched by imports and the AI); the Sinhala
 * and Tamil columns are translations, null until an admin fills them in, and
 * every reader falls back to English for a missing one (skills/skill-name.ts).
 */
export const skills = mysqlTable('skills', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 150 }).notNull().unique(),
  nameSi: varchar('name_si', { length: 150 }),
  nameTa: varchar('name_ta', { length: 150 }),
  category: varchar('category', { length: 100 }),
  categorySi: varchar('category_si', { length: 100 }),
  categoryTa: varchar('category_ta', { length: 100 }),
  description: text('description'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const caregiverSkills = mysqlTable(
  'caregiver_skills',
  {
    caregiverId: varchar('caregiver_id', { length: 36 }).notNull(),
    skillId: varchar('skill_id', { length: 36 }).notNull(),
    proficiency: mysqlEnum('proficiency', proficiencyLevelEnum).notNull().default('BASIC'),
    yearsOfExperience: int('years_of_experience').default(0),
    createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.caregiverId, table.skillId] }),
    skillIdx: index('caregiver_skills_skill_idx').on(table.skillId),
  }),
);
