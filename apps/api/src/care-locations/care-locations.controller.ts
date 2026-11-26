import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { BookingCareLocation, CareLocation, CareLocationSuggestion } from '@care-platform/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CareLocationsService } from './care-locations.service';
import { CreateCareLocationDto, SetBookingCareLocationDto, UpdateCareLocationDto } from './care-locations.dto';

/** The client's own places on the map ("Where care happens"). */
@ApiTags('care-locations')
@ApiBearerAuth()
@Roles('PATIENT_GUARDIAN')
@Controller('me')
export class MyCareLocationsController {
  constructor(private readonly places: CareLocationsService) {}

  @Get('care-locations')
  list(@CurrentUser() user: AuthenticatedUser): Promise<CareLocation[]> {
    return this.places.list(this.places.requirePatient(user.patientId));
  }

  @Post('care-locations')
  @Audit({ action: 'CLIENT_ADD_CARE_LOCATION', entityType: 'CareLocation' })
  create(@Body() dto: CreateCareLocationDto, @CurrentUser() user: AuthenticatedUser): Promise<CareLocation> {
    return this.places.create(this.places.requirePatient(user.patientId), dto, { kind: 'CLIENT', userId: user.userId });
  }

  @Patch('care-locations/:id')
  @Audit({ action: 'CLIENT_UPDATE_CARE_LOCATION', entityType: 'CareLocation' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCareLocationDto, @CurrentUser() user: AuthenticatedUser): Promise<CareLocation> {
    return this.places.update(this.places.requirePatient(user.patientId), id, { ...dto, confirm: undefined }, { kind: 'CLIENT', userId: user.userId });
  }

  @Delete('care-locations/:id')
  @HttpCode(200)
  @Audit({ action: 'CLIENT_REMOVE_CARE_LOCATION', entityType: 'CareLocation' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.places.remove(this.places.requirePatient(user.patientId), id, { kind: 'CLIENT', userId: user.userId });
    return { ok: true };
  }

  /** Which of their places one booking's care happens at (null: their default). */
  @Put('bookings/:id/care-location')
  @HttpCode(200)
  @Audit({ action: 'CLIENT_SET_BOOKING_CARE_LOCATION', entityType: 'Booking' })
  async setForBooking(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetBookingCareLocationDto, @CurrentUser() user: AuthenticatedUser) {
    await this.places.setForBooking(id, dto.careLocationId, { patientId: this.places.requirePatient(user.patientId) });
    return { ok: true };
  }
}

/** Staff: a client's places, including a suggestion from a check-in waiting to be confirmed. */
@ApiTags('care-locations')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('patients/:patientId/care-locations')
export class PatientCareLocationsController {
  constructor(private readonly places: CareLocationsService) {}

  @Get()
  list(@Param('patientId') patientId: string): Promise<CareLocation[]> {
    return this.places.list(patientId, { includeSuggestions: true });
  }

  @Post()
  @Audit({ action: 'ADD_CARE_LOCATION', entityType: 'CareLocation' })
  create(@Param('patientId') patientId: string, @Body() dto: CreateCareLocationDto, @CurrentUser() user: AuthenticatedUser): Promise<CareLocation> {
    return this.places.create(patientId, dto, { kind: 'STAFF', userId: user.userId });
  }

  @Patch(':id')
  @Audit({ action: 'UPDATE_CARE_LOCATION', entityType: 'CareLocation' })
  update(@Param('patientId') patientId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCareLocationDto, @CurrentUser() user: AuthenticatedUser): Promise<CareLocation> {
    return this.places.update(patientId, id, dto, { kind: 'STAFF', userId: user.userId });
  }

  @Delete(':id')
  @HttpCode(200)
  @Audit({ action: 'REMOVE_CARE_LOCATION', entityType: 'CareLocation' })
  async remove(@Param('patientId') patientId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.places.remove(patientId, id, { kind: 'STAFF', userId: user.userId });
    return { ok: true };
  }
}

/** Staff: places suggested from a check-in, waiting to be confirmed (Needs attention). */
@ApiTags('care-locations')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('care-locations')
export class CareLocationSuggestionsController {
  constructor(private readonly places: CareLocationsService) {}

  @Get('suggestions')
  suggestions(): Promise<CareLocationSuggestion[]> {
    return this.places.suggestions();
  }
}

/** Staff: where one booking's care happens. */
@ApiTags('care-locations')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('bookings/:id/care-location')
export class BookingCareLocationController {
  constructor(private readonly places: CareLocationsService) {}

  @Get()
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BookingCareLocation> {
    return this.places.forBooking(id);
  }

  @Put()
  @Audit({ action: 'SET_BOOKING_CARE_LOCATION', entityType: 'Booking' })
  async set(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetBookingCareLocationDto): Promise<BookingCareLocation> {
    await this.places.setForBooking(id, dto.careLocationId);
    return this.places.forBooking(id);
  }
}
