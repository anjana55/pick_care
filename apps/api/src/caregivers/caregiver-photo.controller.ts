import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CaregiverScope } from '../common/decorators/caregiver-scope.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { MAX_PHOTO_UPLOAD_BYTES } from '../international/profile-photo';
import { CaregiverPhotoService } from './caregiver-photo.service';

/**
 * A caregiver's profile photo. CaregiverScope: the caregiver for their own
 * record (from their portal), or staff. The public copy is served by
 * PublicSearchController at /public/caregivers/:publicId/photo.
 */
@ApiTags('caregivers')
@ApiBearerAuth()
@Controller('caregivers/:caregiverId/photo')
export class CaregiverPhotoController {
  constructor(private readonly photos: CaregiverPhotoService) {}

  /** Whether there is one, and its public URL. */
  @Get('info')
  @CaregiverScope()
  info(@Param('caregiverId', ParseUUIDPipe) caregiverId: string) {
    return this.photos.get(caregiverId);
  }

  @Get()
  @CaregiverScope()
  async file(@Param('caregiverId', ParseUUIDPipe) caregiverId: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, mimeType } = await this.photos.file(caregiverId);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(buffer);
  }

  @Post()
  @CaregiverScope('ADMIN', 'STAFF')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_UPLOAD_BYTES } }))
  @Audit({ action: 'UPLOAD_CAREGIVER_PHOTO', entityType: 'Caregiver' })
  upload(@Param('caregiverId', ParseUUIDPipe) caregiverId: string, @UploadedFile() file: Express.Multer.File) {
    return this.photos.upload(caregiverId, file);
  }

  @Delete()
  @CaregiverScope('ADMIN', 'STAFF')
  @Audit({ action: 'DELETE_CAREGIVER_PHOTO', entityType: 'Caregiver' })
  remove(@Param('caregiverId', ParseUUIDPipe) caregiverId: string) {
    return this.photos.remove(caregiverId);
  }
}
