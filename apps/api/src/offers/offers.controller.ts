import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { OffersService } from './offers.service';
import { DeclineOfferDto, SendOfferDto } from './dto/offers.dto';
import { OfferCandidatesQueryDto } from './dto/offer-candidates.dto';
import { OfferCandidatesService } from './offer-candidates.service';

/** Offers on a request, for staff. */
@ApiTags('care-requests')
@ApiBearerAuth()
@Controller('care-requests/:requestId/offers')
@Roles('ADMIN', 'STAFF')
export class RequestOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  list(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.offers.forRequest(requestId);
  }

  @Post()
  @Audit({ action: 'SEND_OFFER', entityType: 'RequestOffer' })
  send(@Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: SendOfferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.offers.send(requestId, dto, user);
  }

  @Post(':offerId/withdraw')
  @HttpCode(200)
  @Audit({ action: 'WITHDRAW_OFFER', entityType: 'RequestOffer' })
  withdraw(@Param('requestId', ParseUUIDPipe) requestId: string, @Param('offerId', ParseUUIDPipe) offerId: string) {
    return this.offers.withdraw(requestId, offerId);
  }

  /** The offer the request's caregiver accepted, with its rates, for the booking form. */
  @Get('accepted')
  async accepted(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return { offer: await this.offers.acceptedFor(requestId) };
  }
}

/** The signed-in caregiver's own offers. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me/care-offers')
@Roles('CAREGIVER')
export class MyOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.offers.forCaregiver(user);
  }

  @Get('count')
  async count(@CurrentUser() user: AuthenticatedUser) {
    return { waiting: await this.offers.waitingCount(user) };
  }

  @Post(':id/accept')
  @HttpCode(200)
  @Audit({ action: 'ACCEPT_OFFER', entityType: 'RequestOffer' })
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.offers.accept(user, id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  @Audit({ action: 'DECLINE_OFFER', entityType: 'RequestOffer' })
  decline(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeclineOfferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.offers.decline(user, id, dto.reason);
  }
}

/** Staff: find the right caregivers to offer a request to. */
@ApiTags('care-requests')
@ApiBearerAuth()
@Controller('care-requests/:requestId/offer-candidates')
@Roles('ADMIN', 'STAFF')
export class OfferCandidatesController {
  constructor(private readonly candidates: OfferCandidatesService) {}

  @Get()
  search(@Param('requestId', ParseUUIDPipe) requestId: string, @Query() query: OfferCandidatesQueryDto, @Req() req: Request & { lang?: string }) {
    return this.candidates.search(requestId, query, req.lang);
  }
}
