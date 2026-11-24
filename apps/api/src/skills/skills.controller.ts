import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { CreateSkillDto, UpdateSkillDto } from './dto/create-skill.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import type { RequestWithLanguage } from '../common/i18n/language.middleware';

@ApiTags('skills')
@ApiBearerAuth()
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  /** Named in the caller's language (`?lang=` or Accept-Language), English where a translation is missing. */
  @Get()
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'si', 'ta'] })
  findAll(@Req() req: RequestWithLanguage) {
    return this.skillsService.list(req.lang);
  }

  @Post()
  @Roles('ADMIN')
  @Audit({ action: 'CREATE_SKILL', entityType: 'Skill' })
  create(@Body() dto: CreateSkillDto, @Req() req: RequestWithLanguage) {
    return this.skillsService.create(dto, req.lang);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @Audit({ action: 'UPDATE_SKILL', entityType: 'Skill' })
  update(@Param('id') id: string, @Body() dto: UpdateSkillDto, @Req() req: RequestWithLanguage) {
    return this.skillsService.update(id, dto, req.lang);
  }
}
