import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OFFER_CANDIDATE_SORTS, type OfferCandidateSort } from '@care-platform/shared';
import { CaregiverQueryDto } from '../../caregivers/dto/caregiver-query.dto';
import { caregiverStatusEnum } from '../../database/schema/caregivers.schema';

const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
};
const toList = ({ value }: { value: unknown }): string[] =>
  (Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : []).map((v) => v.trim()).filter(Boolean);

/**
 * GET /care-requests/:requestId/offer-candidates: the caregiver list's
 * filters (search, districts, towns, skills, languages, gender, shifts) plus
 * the ones that only make sense against a request.
 */
export class OfferCandidatesQueryDto extends OmitType(CaregiverQueryDto, ['status', 'sortBy', 'sortDir', 'page', 'pageSize'] as const) {
  @ApiPropertyOptional({ type: [String], description: 'Comma-separated statuses. Default: those listed on the public site.' })
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(caregiverStatusEnum.length)
  @IsIn(caregiverStatusEnum, { each: true })
  statuses?: (typeof caregiverStatusEnum)[number][];

  @ApiPropertyOptional({ description: "Only those who do the request's kind of care. Default true." })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  doesCareType?: boolean;

  @ApiPropertyOptional({ description: 'Only caregivers with an account, who can answer an offer themselves' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasAccount?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: "Free by the request's start date" })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  freeByStart?: boolean;

  @ApiPropertyOptional({ description: 'No confirmed booking running when the care would start' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  noClash?: boolean;

  @ApiPropertyOptional({ description: 'Show caregivers already offered this request' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeOffered?: boolean;

  @ApiPropertyOptional({ enum: OFFER_CANDIDATE_SORTS })
  @IsOptional()
  @IsIn(OFFER_CANDIDATE_SORTS)
  sort?: OfferCandidateSort;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
