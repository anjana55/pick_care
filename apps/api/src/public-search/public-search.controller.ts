import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import type { RequestWithLanguage } from '../common/i18n/language.middleware';
import { PublicSearchService } from './public-search.service';
import { SearchRequestDto } from './dto/search-request.dto';
import { PublicSearchConfigDto } from './dto/public-search-config.dto';
import { SkillsService } from '../skills/skills.service';
import { LanguagesService } from '../languages/languages.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { CaregiverPhotoService } from '../caregivers/caregiver-photo.service';

/**
 * Everything here is `@Public()` - reachable without a JWT, by design. That
 * makes this controller the API's actual public attack surface, so:
 *   - every route gets its own, tighter throttle than the app-wide default
 *     (see ThrottlerModule config in app.module.ts)
 *   - nothing here ever imports CaregiversService or selects raw rows from
 *     `caregivers` beyond the columns PublicSearchService explicitly lists
 *   - search is POST, not GET, so filter payloads (which may one day
 *     include patient medical-condition free text) don't end up in access
 *     logs or shareable URLs the way query strings do
 */
@ApiTags('public-search')
@Controller('public')
export class PublicSearchController {
  constructor(
    private readonly publicSearchService: PublicSearchService,
    private readonly skillsService: SkillsService,
    private readonly languagesService: LanguagesService,
    private readonly aiSettings: AiSettingsService,
    private readonly photos: CaregiverPhotoService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('search')
  @HttpCode(200)
  search(@Body() dto: SearchRequestDto) {
    return this.publicSearchService.search(dto);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('caregivers/:publicId')
  findOne(@Param('publicId') publicId: string, @Query('locale') locale?: string) {
    return this.publicSearchService.findByPublicId(publicId, locale);
  }

  /** The profile photo of a listed caregiver. Same 404 for unknown, unlisted and no photo. */
  @Public()
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Get('caregivers/:publicId/photo')
  async photo(@Param('publicId') publicId: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, mimeType } = await this.photos.publicFile(publicId);
    // The URL carries a version (?v=), so a replaced photo is a new URL; the
    // short max-age is for removal - a hidden caregiver's face should go soon.
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'public, max-age=600', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(buffer);
  }

  @Public()
  @Get('meta/skills')
  async skills(@Query('locale') locale: string | undefined, @Req() req: RequestWithLanguage) {
    // Named in the visitor's language: `?locale=` like the other meta lists, else Accept-Language.
    const rows = await this.skillsService.list(locale ?? req.lang);
    return rows.map((s) => ({ id: s.id, name: s.name, category: s.category }));
  }

  @Public()
  @Get('meta/languages')
  async languages() {
    const rows = await this.languagesService.findAll();
    return rows.map((l) => ({ id: l.id, name: l.name }));
  }

  /** City-level caregiver counts for the landing map, before any search. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('meta/coverage')
  coverage(@Query('locale') locale?: string) {
    return this.publicSearchService.coverage(locale);
  }

  // Province/district/city lookups live on LocationsController
  // (`public/meta/locations/tree` and `.../cities`). They moved when the
  // reference data became three real tables: serving a locale is part of the
  // read, not an afterthought bolted onto a flat projection.

  @Public()
  @Get('meta/search-config')
  async searchConfig(): Promise<PublicSearchConfigDto> {
    // Straight from Settings > AI: the master switch and the public-search
    // switch both on. Never advertise a search mode the backend can't serve.
    return { aiSearchEnabled: Boolean(await this.aiSettings.forFeature('publicSearch')) };
  }
}
