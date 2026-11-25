import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsISO8601, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { LOCATION_POINTS_BATCH_MAX, type ClientLive, type PointsAccepted, type StaffLiveShare, type StartedShare } from '@care-platform/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { LocationSharesService } from './location-shares.service';

class PointDto {
  @IsISO8601()
  at: string;
  @Type(() => Number)
  @IsNumber()
  latitude: number;
  @Type(() => Number)
  @IsNumber()
  longitude: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracyM?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speed?: number | null;
  @IsOptional()
  @IsBoolean()
  mocked?: boolean;
}

class PointsDto {
  @IsArray()
  @ArrayMaxSize(LOCATION_POINTS_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => PointDto)
  points: PointDto[];
}

/** The caregiver: "On my way", and stopping it. */
@ApiTags('live-location')
@ApiBearerAuth()
@Roles('CAREGIVER')
@Controller('me')
export class MyLocationSharesController {
  constructor(private readonly shares: LocationSharesService) {}

  @Post('shifts/:id/on-my-way')
  @HttpCode(200)
  @Audit({ action: 'ON_MY_WAY', entityType: 'BookingShift' })
  onMyWay(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<StartedShare> {
    return this.shares.startOnMyWay(user, id);
  }

  @Post('location-shares/:id/stop')
  @HttpCode(200)
  async stop(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.shares.stop(user, id);
    return { ok: true };
  }
}

/**
 * The phone sends points here with the share's upload token, not the
 * sign-in: it keeps working with the phone locked and the session expired.
 */
@ApiTags('live-location')
@Controller('location-shares')
export class LocationPointsController {
  constructor(private readonly shares: LocationSharesService) {}

  @Public()
  @Post(':id/points')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({ name: 'X-Share-Token', required: true })
  points(@Param('id', ParseUUIDPipe) id: string, @Headers('x-share-token') token: string | undefined, @Body() dto: PointsDto): Promise<PointsAccepted> {
    return this.shares.addPoints(id, token, dto.points);
  }
}

/** The client: their caregiver on the way. */
@ApiTags('live-location')
@ApiBearerAuth()
@Roles('PATIENT_GUARDIAN')
@Controller('me/bookings')
export class MyBookingLiveController {
  constructor(private readonly shares: LocationSharesService) {}

  @Get(':id/live')
  live(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<ClientLive> {
    return this.shares.clientLive(user, id);
  }
}

/**
 * Staff: everyone sharing their location right now. Opening the live map is
 * written to the audit log (`?opened=1` on its first look); the map's
 * refreshes every few seconds are not, so the log shows who looked, not noise.
 */
@ApiTags('live-location')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('visits')
export class LiveVisitsController {
  constructor(
    private readonly shares: LocationSharesService,
    private readonly audit: AuditService,
  ) {}

  @Get('live')
  async live(@Query('opened') opened: string | undefined, @CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<StaffLiveShare[]> {
    const shares = await this.shares.staffLive();
    if (opened === '1') void this.audit.record({ userId: user.userId, action: 'VIEW_LIVE_LOCATIONS', entityType: 'LocationShare', entityId: null, ipAddress: req.ip ?? null });
    return shares;
  }
}
