import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { contactMethodValues, contactTimeValues, type CommunicationPreferences, type ContactMethod, type ContactTime } from '@care-platform/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CommunicationPreferencesService } from './communication-preferences.service';

/** PATCH body. Every field optional; null clears the contact method or time. */
export class UpdateCommunicationPreferencesDto {
  @ApiPropertyOptional({ enum: contactMethodValues, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(contactMethodValues)
  preferredContactMethod?: ContactMethod | null;

  @ApiPropertyOptional({ enum: contactTimeValues, nullable: true, description: 'Clients only' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(contactTimeValues)
  preferredContactTime?: ContactTime | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reminderMessagesEnabled?: boolean;
}

/** The signed-in client or caregiver's own preferences (website Account > Notifications, app Me > Notifications). */
@ApiTags('communication-preferences')
@ApiBearerAuth()
@Roles('PATIENT_GUARDIAN', 'CAREGIVER')
@Controller('me/communication-preferences')
export class MyCommunicationPreferencesController {
  constructor(private readonly prefs: CommunicationPreferencesService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser): Promise<CommunicationPreferences> {
    return this.prefs.get(await this.prefs.subjectForUser(user.userId, user.role));
  }

  @Patch()
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCommunicationPreferencesDto, @Req() req: Request): Promise<CommunicationPreferences> {
    const subject = await this.prefs.subjectForUser(user.userId, user.role);
    return this.prefs.update(subject, dto, { userId: user.userId, self: true, ip: req.ip });
  }
}

/** Staff: the Communication preferences card on the caregiver and client details pages. */
@ApiTags('communication-preferences')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller()
export class StaffCommunicationPreferencesController {
  constructor(private readonly prefs: CommunicationPreferencesService) {}

  @Get('caregivers/:id/communication-preferences')
  caregiver(@Param('id', ParseUUIDPipe) id: string) {
    return this.prefs.get({ kind: 'CAREGIVER', caregiverId: id });
  }

  @Patch('caregivers/:id/communication-preferences')
  updateCaregiver(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommunicationPreferencesDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.prefs.update({ kind: 'CAREGIVER', caregiverId: id }, dto, { userId: user.userId, self: false, ip: req.ip });
  }

  @Get('patients/:id/communication-preferences')
  client(@Param('id', ParseUUIDPipe) id: string) {
    return this.prefs.get({ kind: 'CLIENT', patientId: id });
  }

  @Patch('patients/:id/communication-preferences')
  updateClient(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommunicationPreferencesDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.prefs.update({ kind: 'CLIENT', patientId: id }, dto, { userId: user.userId, self: false, ip: req.ip });
  }
}
