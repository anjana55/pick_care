import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne } from 'drizzle-orm';
import { randomUUID as uuid } from 'crypto';
import { DRIZZLE, type Database } from '../database/database.module';
import { skills } from '../database/schema';
import type { CreateSkillDto, UpdateSkillDto } from './dto/create-skill.dto';
import { localSkillCategory, localSkillName } from './skill-name';

/** A skill as the staff app and the admin editor see it. */
export interface SkillView {
  id: string;
  /** In the requested language, falling back to English. */
  name: string;
  category: string | null;
  description: string | null;
  /** The stored text, for the Settings editor. */
  nameEn: string;
  nameSi: string | null;
  nameTa: string | null;
  categoryEn: string | null;
  categorySi: string | null;
  categoryTa: string | null;
}

const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

@Injectable()
export class SkillsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Raw rows (English identity) - for internal callers such as imports and the AI. */
  async findAll() {
    return this.db.select().from(skills).orderBy(asc(skills.name));
  }

  /** Every skill, named in `lang`, sorted the way a reader of that language would look for it. */
  async list(lang?: string): Promise<SkillView[]> {
    const rows = await this.findAll();
    return rows.map((r) => this.view(r, lang)).sort((a, b) => a.name.localeCompare(b.name, lang ?? 'en'));
  }

  async create(input: CreateSkillDto, lang?: string): Promise<SkillView> {
    const name = input.name.trim();
    const [existing] = await this.db.select({ id: skills.id }).from(skills).where(eq(skills.name, name)).limit(1);
    if (existing) throw new ConflictException('Skill already exists');
    const id = uuid();
    await this.db.insert(skills).values({
      id,
      name,
      nameSi: blankToNull(input.nameSi) ?? null,
      nameTa: blankToNull(input.nameTa) ?? null,
      category: blankToNull(input.category) ?? null,
      categorySi: blankToNull(input.categorySi) ?? null,
      categoryTa: blankToNull(input.categoryTa) ?? null,
      description: blankToNull(input.description) ?? null,
    });
    return this.findOne(id, lang);
  }

  /** Admin edit: rename, recategorise, or add / correct the translations. */
  async update(id: string, input: UpdateSkillDto, lang?: string): Promise<SkillView> {
    await this.findOne(id, lang);
    const set: Partial<typeof skills.$inferInsert> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Skill name is required');
      const [clash] = await this.db
        .select({ id: skills.id })
        .from(skills)
        .where(and(eq(skills.name, name), ne(skills.id, id)))
        .limit(1);
      if (clash) throw new ConflictException('Skill already exists');
      set.name = name;
    }
    for (const key of ['nameSi', 'nameTa', 'category', 'categorySi', 'categoryTa', 'description'] as const) {
      const value = blankToNull(input[key]);
      if (value !== undefined) set[key] = value;
    }
    if (Object.keys(set).length) await this.db.update(skills).set(set).where(eq(skills.id, id));
    return this.findOne(id, lang);
  }

  private async findOne(id: string, lang?: string): Promise<SkillView> {
    const [row] = await this.db.select().from(skills).where(eq(skills.id, id)).limit(1);
    if (!row) throw new NotFoundException('Skill not found');
    return this.view(row, lang);
  }

  private view(r: typeof skills.$inferSelect, lang?: string): SkillView {
    return {
      id: r.id,
      name: localSkillName(r, lang),
      category: localSkillCategory(r, lang),
      description: r.description,
      nameEn: r.name,
      nameSi: r.nameSi,
      nameTa: r.nameTa,
      categoryEn: r.category,
      categorySi: r.categorySi,
      categoryTa: r.categoryTa,
    };
  }
}
