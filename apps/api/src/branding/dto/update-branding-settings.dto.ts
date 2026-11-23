import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { LOCALES, TEXT_SCALE_MAX, TEXT_SCALE_MIN, type Locale } from '@care-platform/shared';

/** Known languages only, each a whole percent within the allowed range. */
@ValidatorConstraint({ name: 'textScale' })
class TextScaleRule implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(value as Record<string, unknown>).every(
      ([locale, pct]) => (LOCALES as readonly string[]).includes(locale) && Number.isInteger(pct) && (pct as number) >= TEXT_SCALE_MIN && (pct as number) <= TEXT_SCALE_MAX,
    );
  }
  defaultMessage() {
    return `Choose a text size between ${TEXT_SCALE_MIN}% and ${TEXT_SCALE_MAX}% for each language`;
  }
}

/**
 * Partial update - the admin form sends back what it has. An empty string for
 * the short name or tagline means "clear it" (a cleared short name falls back
 * to the company name's initials). Whether the colours are readable is checked
 * in the service, against the same rule the form previews with.
 */
export class UpdateBrandingSettingsDto {
  @ApiPropertyOptional({ example: 'Golden Years Care' })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  @Matches(/\S/, { message: 'Enter the company name' })
  companyName?: string;

  @ApiPropertyOptional({ example: 'GY', description: '1-4 letters shown in the badge when there is no logo. Empty = initials of the company name.' })
  @IsOptional() @IsString()
  @Matches(/^$|^[^\s<>]{1,4}$/u, { message: 'The short name is 1 to 4 characters, with no spaces' })
  shortName?: string;

  @ApiPropertyOptional({ example: 'Trusted care, close to home' })
  @IsOptional() @IsString() @MaxLength(160)
  tagline?: string;

  @ApiPropertyOptional({ example: '0112345678', description: 'The office phone number for "Call the office" buttons. Empty = hide them.' })
  @IsOptional() @IsString() @MaxLength(32)
  @Matches(/^$|^\+?[\d\s().-]{7,32}$/, { message: 'Enter the office phone number using digits, spaces and an optional leading +' })
  officePhone?: string;

  @ApiPropertyOptional({ example: '#5F6952' })
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Enter the primary colour as a hex value, e.g. #5F6952' })
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#2F7A84' })
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Enter the accent colour as a hex value, e.g. #2F7A84' })
  accentColor?: string;

  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional() @IsIn(LOCALES)
  defaultLocale?: Locale;

  @ApiPropertyOptional({ enum: LOCALES, isArray: true })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(LOCALES.length) @IsIn(LOCALES, { each: true })
  enabledLocales?: Locale[];

  @ApiPropertyOptional({
    example: { en: 100, si: 90, ta: 90 },
    description: `Text size per language, in percent (${TEXT_SCALE_MIN}-${TEXT_SCALE_MAX}). Languages left out keep their size.`,
  })
  @IsOptional()
  @IsObject()
  @Validate(TextScaleRule)
  textScale?: Partial<Record<Locale, number>>;
}
