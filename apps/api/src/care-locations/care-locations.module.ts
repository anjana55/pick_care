import { Module } from '@nestjs/common';
import { CareLocationsService } from './care-locations.service';
import { BookingCareLocationController, MyCareLocationsController, PatientCareLocationsController } from './care-locations.controller';

@Module({
  controllers: [MyCareLocationsController, PatientCareLocationsController, BookingCareLocationController],
  providers: [CareLocationsService],
  exports: [CareLocationsService],
})
export class CareLocationsModule {}
