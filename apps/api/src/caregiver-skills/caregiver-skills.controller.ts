import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { RequestWithLanguage } from '../common/i18n/language.middleware';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CaregiverSkillsService } from './caregiver-skills.service';
import { AssignSkillDto } from './dto/assign-skill.dto';
import { CaregiverScope } from '../common/decorators/caregiver-scope.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@ApiTags('caregiver-skills')
@ApiBearerAuth()
@Controller('caregivers/:caregiverId/skills')
export class CaregiverSkillsController {
  constructor(private readonly caregiverSkillsService: CaregiverSkillsService) {}

  @Get()
  @CaregiverScope()
  findAll(@Param('caregiverId') caregiverId: string, @Req() req: RequestWithLanguage) {
    return this.caregiverSkillsService.findAllForCaregiver(caregiverId, req.lang);
  }

  @Post()
  @CaregiverScope()
  @Audit({ action: 'ASSIGN_SKILL', entityType: 'Caregiver' })
  assign(@Param('caregiverId') caregiverId: string, @Body() dto: AssignSkillDto, @Req() req: RequestWithLanguage) {
    return this.caregiverSkillsService.assign(caregiverId, dto, req.lang);
  }

  @Delete(':skillId')
  @CaregiverScope()
  @Audit({ action: 'REMOVE_SKILL', entityType: 'Caregiver' })
  remove(@Param('caregiverId') caregiverId: string, @Param('skillId') skillId: string) {
    return this.caregiverSkillsService.remove(caregiverId, skillId);
  }
}
