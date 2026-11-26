import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ADDRESS_SEARCH_MAX_LENGTH, ADDRESS_SEARCH_MIN_LENGTH, LOCALES } from '@care-platform/shared';

export class AddressSearchDto {
  @ApiProperty({ description: 'An address, street, landmark or town, as typed' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(ADDRESS_SEARCH_MIN_LENGTH)
  @MaxLength(ADDRESS_SEARCH_MAX_LENGTH)
  q!: string;

  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: (typeof LOCALES)[number];
}
