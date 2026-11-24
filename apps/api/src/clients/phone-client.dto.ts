import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { PatientProfileDto } from '../auth/dto/patient-profile.dto';
import { TextField } from '../common/validation/text-field.validator';

const trimToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

/**
 * A client staff add themselves, usually while on the phone with them. The
 * same intake the public sign-up asks for (PatientProfileDto), plus who they
 * are and a number to reach them on.
 *
 * The phone number is mandatory - it is how staff reach them and it becomes
 * their WhatsApp sign-in. Email is optional: many callers have none. There is
 * no password: they can sign in later with a WhatsApp code sent to the number.
 *
 * Used by POST /patients ("Add new client") and as `newClient` on
 * POST /care-requests (a first-time caller logged with a request).
 */
export class PhoneClientDto extends PatientProfileDto {
  @ApiProperty()
  @TextField({ min: 2, max: 255, requiredMessage: 'Full name is required', invalidMessage: 'Enter a valid full name' })
  @IsString({ message: 'Full name must be text' })
  fullName: string;

  @ApiProperty({ example: '0771234567', description: "The client's mobile number - becomes their WhatsApp sign-in number" })
  @TextField({ phone: true, requiredMessage: 'Phone number is required', invalidMessage: 'Enter a valid phone number' })
  @IsString({ message: 'Phone number must be text' })
  phone: string;

  @ApiPropertyOptional({ description: 'Optional - leave out if the client has no email address' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiProperty({ description: 'The client agreed, on the call, to us storing their details to arrange care' })
  @Equals(true, { message: 'Confirm the client agreed to us keeping their details' })
  consentConfirmed: boolean;
}
