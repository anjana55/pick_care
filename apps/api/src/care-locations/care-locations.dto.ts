import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CARE_LOCATION_LABEL_MAX } from '@care-platform/shared';

/** POST …/care-locations */
export class CreateCareLocationDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber({}, { message: 'Choose the place on the map' })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({}, { message: 'Choose the place on the map' })
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ maxLength: CARE_LOCATION_LABEL_MAX, example: 'Home' })
  @IsOptional()
  @IsString()
  @MaxLength(CARE_LOCATION_LABEL_MAX)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** PATCH …/care-locations/:id */
export class UpdateCareLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ maxLength: CARE_LOCATION_LABEL_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(CARE_LOCATION_LABEL_MAX)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Staff only: confirm a place suggested from a check-in' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

/** PUT …/bookings/:id/care-location */
export class SetBookingCareLocationDto {
  @ApiProperty({ nullable: true, description: "One of the client's places, or null for their default" })
  @ValidateIf((o: SetBookingCareLocationDto) => o.careLocationId !== null)
  @IsUUID()
  careLocationId: string | null;
}
