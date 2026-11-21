import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Equals, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { CreateCaregiverDto } from '../../caregivers/dto/create-caregiver.dto';
import { OptionalPhoneField, TextField } from '../../common/validation/text-field.validator';
import { PatientProfileDto } from './patient-profile.dto';

export const SIGNUP_SIDES = ['client', 'caregiver'] as const;
export type SignupSideParam = (typeof SIGNUP_SIDES)[number];

const TICKET_HELP =
  'The ticket from /auth/signup/whatsapp/verify-otp or /auth/signup/identity/exchange. Leave it out to register with email and password instead.';

/** GET /auth/signup/methods */
export class SignupMethodsQueryDto {
  @ApiProperty({ enum: SIGNUP_SIDES })
  @IsIn(SIGNUP_SIDES)
  side: SignupSideParam;
}

/** POST /auth/signup/whatsapp/request-otp */
export class SignupOtpRequestDto {
  @ApiProperty({ enum: SIGNUP_SIDES })
  @IsIn(SIGNUP_SIDES)
  side: SignupSideParam;

  @ApiProperty({ description: 'The WhatsApp number to send the code to. Sri Lankan numbers may be written 0771234567 or +94771234567' })
  @TextField({ min: 7, max: 20, requiredMessage: 'WhatsApp number is required', invalidMessage: 'Enter a valid WhatsApp number' })
  @IsString({ message: 'WhatsApp number must be text' })
  phone: string;
}

/** POST /auth/signup/whatsapp/verify-otp */
export class SignupOtpVerifyDto extends SignupOtpRequestDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{4,8}$/, { message: 'Enter the numeric code from WhatsApp' })
  code: string;
}

/** POST /auth/signup/identity/exchange */
export class SignupIdentityExchangeDto {
  @ApiProperty({ description: 'The one-time code from the provider callback' })
  @IsString()
  @Length(16, 128)
  code: string;

  @ApiPropertyOptional({ description: 'The mobile app only: the PKCE verifier its challenge was made from' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  verifier?: string;
}

/**
 * POST /auth/signup/client - a new client, the sign-in method chosen first.
 *
 * Exactly one of: `signupTicket` (WhatsApp or a provider, already proven),
 * or `email` + `password`. Whatever the ticket proved is not asked again: a
 * WhatsApp sign-up needs no phone number here (the verified one is used),
 * a provider sign-up no email address.
 */
export class SignupClientDto extends PatientProfileDto {
  @ApiProperty()
  @TextField({ min: 2, max: 255, requiredMessage: 'Full name is required', invalidMessage: 'Enter your full name' })
  @IsString({ message: 'Full name must be text' })
  fullName: string;

  @ApiPropertyOptional({ description: 'Required unless the ticket is a WhatsApp one - then the verified number is used' })
  @IsOptional()
  @OptionalPhoneField('Enter a valid phone number')
  phone?: string;

  @ApiPropertyOptional({ description: TICKET_HELP })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  signupTicket?: string;

  @ApiPropertyOptional({ description: 'Email sign-up only' })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @ApiPropertyOptional({ description: 'Email sign-up only. Minimum 8 characters' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password?: string;

  @ApiProperty({ description: 'Must be true - explicit consent to data processing' })
  @Equals(true, { message: 'You must accept the data processing consent to register' })
  consentAccepted: boolean;

  @ApiProperty({ description: 'Must be true - the client service agreement was accepted' })
  @Equals(true, { message: 'You must accept the service agreement to register' })
  agreementAccepted: boolean;

  @ApiProperty({ description: 'The version of the agreement that was shown (packages/shared agreements.ts)' })
  @IsString()
  @MaxLength(32)
  agreementVersion: string;
}

/**
 * POST /auth/signup/caregiver - a new caregiver, the sign-in method chosen
 * first. Same personal information as every caregiver sign-up; one phone
 * number (`phone`), which a WhatsApp ticket supplies itself.
 */
export class SignupCaregiverDto extends OmitType(CreateCaregiverDto, ['primaryPhone'] as const) {
  @ApiPropertyOptional({ description: 'Required unless the ticket is a WhatsApp one - then the verified number is used' })
  @IsOptional()
  @OptionalPhoneField('Enter a valid phone number with at least 9 digits')
  phone?: string;

  @ApiPropertyOptional({ description: TICKET_HELP })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  signupTicket?: string;

  @ApiPropertyOptional({ description: 'Email sign-up only' })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @ApiPropertyOptional({ description: 'Email sign-up only. Minimum 8 characters' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password?: string;

  @ApiProperty({ description: 'Must be true - explicit consent to data processing' })
  @Equals(true, { message: 'You must accept the data processing consent to register' })
  consentAccepted: boolean;

  @ApiProperty({ description: 'Must be true - the caregiver service agreement was accepted' })
  @Equals(true, { message: 'You must accept the service agreement to register' })
  agreementAccepted: boolean;

  @ApiProperty({ description: 'The version of the agreement that was shown (packages/shared agreements.ts)' })
  @IsString()
  @MaxLength(32)
  agreementVersion: string;
}
