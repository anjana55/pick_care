import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module';
import { caregiverSkills, skills } from '../database/schema';
import { AssignSkillDto } from './dto/assign-skill.dto';
import { skillNameSql } from '../skills/skill-name';

@Injectable()
export class CaregiverSkillsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Named in `lang`, English where a translation is missing. */
  findAllForCaregiver(caregiverId: string, lang?: string) {
    return this.db
      .select({
        skillId: caregiverSkills.skillId,
        name: skillNameSql(lang),
        category: skills.category,
        proficiency: caregiverSkills.proficiency,
        yearsOfExperience: caregiverSkills.yearsOfExperience,
      })
      .from(caregiverSkills)
      .innerJoin(skills, eq(caregiverSkills.skillId, skills.id))
      .where(eq(caregiverSkills.caregiverId, caregiverId));
  }

  async assign(caregiverId: string, dto: AssignSkillDto, lang?: string) {
    const [existing] = await this.db
      .select()
      .from(caregiverSkills)
      .where(and(eq(caregiverSkills.caregiverId, caregiverId), eq(caregiverSkills.skillId, dto.skillId)))
      .limit(1);
    if (existing) throw new ConflictException('This skill is already assigned to the caregiver');

    await this.db.insert(caregiverSkills).values({
      caregiverId,
      skillId: dto.skillId,
      proficiency: dto.proficiency ?? 'BASIC',
      yearsOfExperience: dto.yearsOfExperience ?? 0,
    });
    return this.findAllForCaregiver(caregiverId, lang);
  }

  async remove(caregiverId: string, skillId: string) {
    await this.db
      .delete(caregiverSkills)
      .where(and(eq(caregiverSkills.caregiverId, caregiverId), eq(caregiverSkills.skillId, skillId)));
    return { success: true };
  }
}
