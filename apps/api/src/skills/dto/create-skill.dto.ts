import { ApiPropertyOptional, ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * A skill and its translations. `name` (English) is required and unique; the
 * Sinhala and Tamil names are optional - a missing one is shown in English.
 */
export class CreateSkillDto {
  @ApiProperty({ description: 'English name - also how imports and the AI refer to the skill' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Skill name is required' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'Sinhala name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  nameSi?: string;

  @ApiPropertyOptional({ description: 'Tamil name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  nameTa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  categorySi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  categoryTa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

/** PATCH /skills/:id - any subset; an empty string clears a translation. */
export class UpdateSkillDto extends PartialType(CreateSkillDto) {}
