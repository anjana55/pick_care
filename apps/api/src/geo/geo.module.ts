import { Module } from '@nestjs/common';
import { GeoService } from './geo.service';
import { AddressSearchController, ClientGeoController, PublicGeoController } from './geo.controller';
import { AddressSearchService } from './address-search.service';

@Module({
  controllers: [PublicGeoController, ClientGeoController, AddressSearchController],
  providers: [GeoService, AddressSearchService],
  exports: [GeoService],
})
export class GeoModule {}
