import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { CARE_REQUEST_MESSAGE_MAX, careTypeValues, type CareType } from '@care-platform/shared';
import { PhoneClientDto } from '../../clients/phone-client.dto';
import { careRequestLanguageEnum, type CareRequestLanguage } from '../../database/schema';

const trimToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

/**
 * POST /care-requests - a request staff take down during a phone call.
 * Exactly one of `patientId` (an existing client) or `newClient` (a first-time
 * caller). The caregiver is optional: staff can log the need now and match later.
 */
export { PhoneClientDto };

export class CreateStaffCareRequestDto {
  @ApiPropertyOptional({ description: 'An existing client' })
  @ValidateIf((o: CreateStaffCareRequestDto) => !o.newClient)
  @IsUUID('all', { message: 'Choose the client, or add them as a new caller' })
  patientId?: string;

  @ApiPropertyOptional({ type: PhoneClientDto })
  @ValidateIf((o: CreateStaffCareRequestDto) => !o.patientId)
  @ValidateNested()
  @Type(() => PhoneClientDto)
  newClient?: PhoneClientDto;

  @ApiPropertyOptional({ description: 'Internal caregiver id; omit to match later' })
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid caregiver' })
  caregiverId?: string;

  @ApiPropertyOptional({ enum: careTypeValues, description: 'The type of care the caller needs, if they said' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsIn(careTypeValues, { message: 'Choose a valid type of care' })
  careType?: CareType;

  @ApiPropertyOptional({ maxLength: CARE_REQUEST_MESSAGE_MAX, description: 'What the caller asked for, in their words' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(CARE_REQUEST_MESSAGE_MAX, { message: 'Your message is too long - please keep it under 1000 characters' })
  message?: string;

  @ApiProperty({ enum: careRequestLanguageEnum, description: "The language the caller's updates are sent in" })
  @IsIn(careRequestLanguageEnum, { message: 'Choose the language for updates' })
  language: CareRequestLanguage;
}

export class SetCareRequestCaregiverDto {
  @ApiProperty({ nullable: true, description: 'Internal caregiver id, or null to detach' })
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid caregiver' })
  caregiverId: string | null;
}
