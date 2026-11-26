import { Module } from '@nestjs/common';
import { CareRequestsModule } from '../care-requests/care-requests.module';
import { PricingModule } from '../pricing/pricing.module';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { OffersService } from './offers.service';
import { MyOffersController, OfferCandidatesController, RequestOffersController } from './offers.controller';
import { OfferCandidatesService } from './offer-candidates.service';
import { CaregiversModule } from '../caregivers/caregivers.module';
import { CandidatePoolModule } from '../matching/candidate-pool.module';

/** Job offers: a request offered to caregivers, answered by them. */
@Module({
  imports: [CareRequestsModule, PricingModule, EmailModule, WhatsappModule, CaregiversModule, CandidatePoolModule],
  controllers: [RequestOffersController, MyOffersController, OfferCandidatesController],
  providers: [OffersService, OfferCandidatesService],
  exports: [OffersService],
})
export class OffersModule {}
