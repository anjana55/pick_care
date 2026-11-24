import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID as uuid } from 'crypto';
import { PUBLIC_CAREGIVER_STATUSES } from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { caregivers } from '../database/schema';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface';
import { preparePublicPhoto } from '../international/profile-photo';
import { assertNoPendingDeletion } from '../account-deletion/pending-deletion.util';

/** What the staff app and the caregiver's own portal are told about the photo. */
export interface CaregiverPhotoState {
  hasPhoto: boolean;
  /** Public address (relative to the API) of the photo, versioned; null without a photo. */
  photoUrl: string | null;
  photoUpdatedAt: Date | null;
}

/**
 * The public URL of a caregiver's photo, or null. Keyed by publicId (never
 * the internal id) and versioned by photoUpdatedAt, so a replaced photo is a
 * new URL rather than a stale cache hit.
 */
export function publicPhotoUrl(row: { publicId: string; photoKey: string | null; photoUpdatedAt: Date | null }): string | null {
  if (!row.photoKey) return null;
  const v = row.photoUpdatedAt ? new Date(row.photoUpdatedAt).getTime() : 0;
  return `/public/caregivers/${encodeURIComponent(row.publicId)}/photo?v=${v}`;
}

/**
 * A caregiver's profile photo: uploaded by the caregiver from their portal or
 * by staff, and shown on the public profile and search cards.
 *
 * Every upload is re-encoded by preparePublicPhoto (square WebP, metadata and
 * GPS position dropped), so what is served is always bytes this API made.
 * The public copy is only served while the caregiver is publicly listed -
 * the same rule search uses - so a suspended or deleted caregiver's face
 * stops being reachable at once.
 */
@Injectable()
export class CaregiverPhotoService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private async row(caregiverId: string) {
    const [row] = await this.db
      .select({
        id: caregivers.id,
        publicId: caregivers.publicId,
        photoKey: caregivers.photoKey,
        photoMimeType: caregivers.photoMimeType,
        photoUpdatedAt: caregivers.photoUpdatedAt,
        deletedAt: caregivers.deletedAt,
      })
      .from(caregivers)
      .where(eq(caregivers.id, caregiverId))
      .limit(1);
    if (!row || row.deletedAt) throw new NotFoundException('Caregiver not found');
    return row;
  }

  private state(row: { publicId: string; photoKey: string | null; photoUpdatedAt: Date | null }): CaregiverPhotoState {
    return { hasPhoto: Boolean(row.photoKey), photoUrl: publicPhotoUrl(row), photoUpdatedAt: row.photoKey ? row.photoUpdatedAt : null };
  }

  async get(caregiverId: string): Promise<CaregiverPhotoState> {
    return this.state(await this.row(caregiverId));
  }

  async upload(caregiverId: string, file: Express.Multer.File | undefined): Promise<CaregiverPhotoState> {
    if (!file) throw new BadRequestException('Choose a photo to upload.');
    const row = await this.row(caregiverId);
    // An account on its way to erasure gets no new personal data.
    await assertNoPendingDeletion(this.db, { caregiverId });
    const photo = await preparePublicPhoto(file);
    const key = `caregiver-photos/${caregiverId}/${uuid()}.webp`;
    await this.storage.upload({ key, buffer: photo.buffer, mimeType: photo.mimeType });
    const now = new Date();
    await this.db
      .update(caregivers)
      .set({ photoKey: key, photoMimeType: photo.mimeType, photoUpdatedAt: now })
      .where(eq(caregivers.id, caregiverId));
    // The old file only after the row points at the new one.
    if (row.photoKey) await this.storage.delete(row.photoKey).catch(() => undefined);
    return this.state({ ...row, photoKey: key, photoUpdatedAt: now });
  }

  async remove(caregiverId: string): Promise<CaregiverPhotoState> {
    const row = await this.row(caregiverId);
    if (row.photoKey) {
      await this.db.update(caregivers).set({ photoKey: null, photoMimeType: null, photoUpdatedAt: new Date() }).where(eq(caregivers.id, caregiverId));
      await this.storage.delete(row.photoKey).catch(() => undefined);
    }
    return this.state({ ...row, photoKey: null });
  }

  /** The bytes, for the caregiver themselves or staff - whatever the caregiver's status. */
  async file(caregiverId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const row = await this.row(caregiverId);
    if (!row.photoKey) throw new NotFoundException('No photo');
    return { buffer: await this.storage.download(row.photoKey), mimeType: row.photoMimeType ?? 'image/webp' };
  }

  /**
   * The bytes for the public site, by publicId. One 404 for "no such
   * caregiver", "not listed" and "no photo", like the profile endpoint.
   */
  async publicFile(publicId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const [row] = await this.db
      .select({ photoKey: caregivers.photoKey, photoMimeType: caregivers.photoMimeType })
      .from(caregivers)
      .where(and(eq(caregivers.publicId, publicId), isNull(caregivers.deletedAt), inArray(caregivers.status, [...PUBLIC_CAREGIVER_STATUSES])))
      .limit(1);
    if (!row?.photoKey) throw new NotFoundException('No photo');
    return { buffer: await this.storage.download(row.photoKey), mimeType: row.photoMimeType ?? 'image/webp' };
  }
}
