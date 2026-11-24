import { Module } from '@nestjs/common';
import { PublicSearchController } from './public-search.controller';
import { PublicSearchService } from './public-search.service';
import { RankingService } from './ranking/ranking.service';
import { SkillsModule } from '../skills/skills.module';
import { LanguagesModule } from '../languages/languages.module';
import { LocationsModule } from '../locations/locations.module';
import { GeoModule } from '../geo/geo.module';
import { CaregiverPhotoService } from '../caregivers/caregiver-photo.service';

@Module({
  imports: [SkillsModule, LanguagesModule, LocationsModule, GeoModule],
  controllers: [PublicSearchController],
  // CaregiverPhotoService directly, not CaregiversModule: this module only ever serves the public copy.
  providers: [PublicSearchService, RankingService, CaregiverPhotoService],
  exports: [PublicSearchService, RankingService],
})
export class PublicSearchModule {}
