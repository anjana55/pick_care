import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { CaregiverScope } from '../common/decorators/caregiver-scope.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { MAX_PHOTO_UPLOAD_BYTES } from '../international/profile-photo';
import { CaregiverPhotoService, type PhotoActor } from './caregiver-photo.service';

export class RejectPhotoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

const isStaff = (user: AuthenticatedUser) => user.role === 'ADMIN' || user.role === 'STAFF';
const actorOf = (user: AuthenticatedUser): PhotoActor => (isStaff(user) ? 'STAFF' : 'CAREGIVER');

const sendImage = (res: Response, { buffer, mimeType }: { buffer: Buffer; mimeType: string }) => {
  res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  return new StreamableFile(buffer);
};

/**
 * A caregiver's profile photo. CaregiverScope: the caregiver for their own
 * record (from their portal), or staff. A caregiver's upload waits for staff
 * approval; a staff upload is approved at once. Approve and reject are staff
 * only. The approved copy is served publicly by PublicSearchController at
 * /public/caregivers/:publicId/photo.
 */
@ApiTags('caregivers')
@ApiBearerAuth()
@Controller('caregivers/:caregiverId/photo')
export class CaregiverPhotoController {
  constructor(private readonly photos: CaregiverPhotoService) {}

  /** Approved photo, pending upload and last rejection. */
  @Get('info')
  @CaregiverScope()
  info(@Param('caregiverId', ParseUUIDPipe) caregiverId: string) {
    return this.photos.get(caregiverId);
  }

  /** The approved photo. */
  @Get()
  @CaregiverScope()
  async file(@Param('caregiverId', ParseUUIDPipe) caregiverId: string, @Res({ passthrough: true }) res: Response) {
    return sendImage(res, await this.photos.file(caregiverId, 'approved'));
  }

  /** The upload waiting for approval - for staff reviewing it and the caregiver who sent it. */
  @Get('pending')
  @CaregiverScope()
  async pendingFile(@Param('caregiverId', ParseUUIDPipe) caregiverId: string, @Res({ passthrough: true }) res: Response) {
    return sendImage(res, await this.photos.file(caregiverId, 'pending'));
  }

  @Post()
  @CaregiverScope('ADMIN', 'STAFF')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES } }))
  @Audit({ action: 'UPLOAD_CAREGIVER_PHOTO', entityType: 'Caregiver' })
  upload(@Param('caregiverId', ParseUUIDPipe) caregiverId: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    return this.photos.upload(caregiverId, file, actorOf(user));
  }

  @Post('approve')
  @CaregiverScope('ADMIN', 'STAFF')
  @Audit({ action: 'APPROVE_CAREGIVER_PHOTO', entityType: 'Caregiver' })
  approve(@Param('caregiverId', ParseUUIDPipe) caregiverId: string, @CurrentUser() user: AuthenticatedUser) {
    // CaregiverScope lets the caregiver in for their own record: approving is not theirs to do.
    if (!isStaff(user)) throw new ForbiddenException('Only staff can approve photos.');
    return this.photos.approve(caregiverId);
  }

  @Post('reject')
  @CaregiverScope('ADMIN', 'STAFF')
  @Audit({ action: 'REJECT_CAREGIVER_PHOTO', entityType: 'Caregiver' })
  reject(@Param('caregiverId', ParseUUIDPipe) caregiverId: string, @Body() dto: RejectPhotoDto, @CurrentUser() user: AuthenticatedUser) {
    if (!isStaff(user)) throw new ForbiddenException('Only staff can approve photos.');
    return this.photos.reject(caregiverId, dto.reason);
  }

  @Delete()
  @CaregiverScope('ADMIN', 'STAFF')
  @Audit({ action: 'DELETE_CAREGIVER_PHOTO', entityType: 'Caregiver' })
  remove(@Param('caregiverId', ParseUUIDPipe) caregiverId: string) {
    return this.photos.remove(caregiverId);
  }
}

/** Staff: every caregiver photo waiting for approval, oldest first. */
@ApiTags('caregivers')
@ApiBearerAuth()
@Controller('caregiver-photos')
export class CaregiverPhotoQueueController {
  constructor(private readonly photos: CaregiverPhotoService) {}

  @Get('pending')
  @Roles('ADMIN', 'STAFF')
  pending() {
    return this.photos.listPending();
  }
}
