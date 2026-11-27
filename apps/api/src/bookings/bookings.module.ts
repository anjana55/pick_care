import { Module } from '@nestjs/common';
import { PublicSearchModule } from '../public-search/public-search.module';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CarePlansModule } from '../care-plans/care-plans.module';
import { BookingsService } from './bookings.service';
import { BookingNotifier } from './booking-notifier.service';
import { BookingAgentService } from './booking-agent.service';
import { BookingsController, MyBookingsController } from './bookings.controller';
import { CheckInService } from './check-in.service';
import { LocationSharesService } from './location-shares.service';
import { PresenceAgentService } from './presence-agent.service';
import { LiveVisitsController, LocationPointsController, MyBookingLiveController, MyLocationSharesController } from './location-shares.controller';
import { CareLocationsModule } from '../care-locations/care-locations.module';
import { AuditModule } from '../audit/audit.module';
import { LiveCareAgentService } from './live-care-agent.service';
import { CheckInSettingsController, MyCheckInController, VisitsController } from './check-in.controller';

@Module({
  imports: [PublicSearchModule, EmailModule, WhatsappModule, CarePlansModule, CareLocationsModule, AuditModule],
  controllers: [
    BookingsController,
    MyBookingsController,
    MyCheckInController,
    LiveVisitsController,
    VisitsController,
    CheckInSettingsController,
    MyLocationSharesController,
    LocationPointsController,
    MyBookingLiveController,
  ],
  providers: [BookingsService, BookingNotifier, BookingAgentService, CheckInService, LiveCareAgentService, LocationSharesService, PresenceAgentService],
  // The assistant runs approved booking changes through BookingsService; corrections also tell people through BookingNotifier.
  exports: [BookingsService, BookingNotifier, BookingAgentService, CheckInService, LiveCareAgentService],
})
export class BookingsModule {}
