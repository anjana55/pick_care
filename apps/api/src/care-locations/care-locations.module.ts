import { Module } from '@nestjs/common';
import { CareLocationsService } from './care-locations.service';
import {
  BookingCareLocationController,
  CareLocationSuggestionsController,
  MyCareLocationsController,
  PatientCareLocationsController,
} from './care-locations.controller';

@Module({
  controllers: [MyCareLocationsController, PatientCareLocationsController, BookingCareLocationController, CareLocationSuggestionsController],
  providers: [CareLocationsService],
  exports: [CareLocationsService],
})
export class CareLocationsModule {}
