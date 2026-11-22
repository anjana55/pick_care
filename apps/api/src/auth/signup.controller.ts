import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuditService } from '../audit/audit.service';
import { resolveLanguage } from '../common/i18n/language';
import { SignupService } from './signup.service';
import {
  SignupCaregiverDto,
  SignupClientDto,
  SignupIdentityExchangeDto,
  SignupMethodsQueryDto,
  SignupOtpRequestDto,
  SignupOtpVerifyDto,
} from './dto/signup.dto';

/**
 * Registration with the sign-in method chosen first (SignupService). The
 * provider step is GET /auth/social/:provider/signup-url, next to the other
 * provider routes in SocialAuthController; its callback sends the browser
 * (or app) back with a code for POST identity/exchange.
 */
@ApiTags('auth')
@Controller('auth/signup')
export class SignupController {
  constructor(
    private readonly signup: SignupService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get('methods')
  methods(@Query() query: SignupMethodsQueryDto) {
    return this.signup.methods(query.side);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('whatsapp/request-otp')
  @HttpCode(200)
  requestOtp(@Body() dto: SignupOtpRequestDto) {
    return this.signup.requestOtp(dto.side, dto.phone);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('whatsapp/verify-otp')
  @HttpCode(200)
  async verifyOtp(@Body() dto: SignupOtpVerifyDto, @Req() req: Request) {
    const result = await this.signup.verifyOtp(dto.side, dto.phone, dto.code);
    await this.audit.record({ action: result.signedIn ? 'LOGIN_WHATSAPP' : 'SIGNUP_VERIFY_WHATSAPP', entityType: 'User', ipAddress: req.ip });
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('identity/exchange')
  @HttpCode(200)
  exchange(@Body() dto: SignupIdentityExchangeDto) {
    return this.signup.exchangeIdentityCode(dto.code, dto.verifier);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('client')
  async registerClient(@Body() dto: SignupClientDto, @Req() req: Request) {
    const { userId, ...result } = await this.signup.registerClient(dto, this.meta(req));
    await this.audit.record({ userId, action: 'REGISTER_PATIENT_SIGNUP', entityType: 'User', entityId: userId, ipAddress: req.ip });
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('caregiver')
  async registerCaregiver(@Body() dto: SignupCaregiverDto, @Req() req: Request) {
    const { userId, caregiverId, ...result } = await this.signup.registerCaregiver(dto, this.meta(req));
    await this.audit.record({ userId, action: 'REGISTER_CAREGIVER_SIGNUP', entityType: 'Caregiver', entityId: caregiverId, ipAddress: req.ip });
    return result;
  }

  private meta(req: Request) {
    return { ip: req.ip, locale: resolveLanguage(req.query?.lang, req.headers['accept-language']) };
  }
}
