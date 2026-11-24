import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { randomUUID as uuid } from 'crypto';
import { PUBLIC_CAREGIVER_STATUSES } from '@care-platform/shared';
import { DRIZZLE, type Database } from '../database/database.module';
import { caregivers } from '../database/schema';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.interface';
import { preparePublicPhoto } from '../international/profile-photo';
import { assertNoPendingDeletion } from '../account-deletion/pending-deletion.util';
import { NotificationsService } from '../notifications/notifications.service';
import { photoReviewedNotice } from '../notifications/notification-messages';

/** What the staff app and the caregiver's own portal are told about the photo. */
export interface CaregiverPhotoState {
  /** An approved photo is on the public profile. */
  hasPhoto: boolean;
  /** Public address (relative to the API) of the approved photo, versioned; null without one. */
  photoUrl: string | null;
  photoUpdatedAt: Date | null;
  /** A caregiver's upload waiting for staff; never public. */
  pending: { uploadedAt: Date | null } | null;
  /** The last rejection, until the caregiver uploads again. */
  rejected: { at: Date; reason: string | null } | null;
}

/** One row of the staff "Photos to approve" list. */
export interface PendingPhotoItem {
  caregiverId: string;
  fullName: string;
  registrationNumber: string | null;
  uploadedAt: Date | null;
  hasApprovedPhoto: boolean;
}

/** Who is changing the photo: the caregiver themselves, or staff. */
export type PhotoActor = 'CAREGIVER' | 'STAFF';

/**
 * The public URL of a caregiver's approved photo, or null. Keyed by publicId
 * (never the internal id) and versioned by photoUpdatedAt, so a replaced
 * photo is a new URL rather than a stale cache hit.
 */
export function publicPhotoUrl(row: { publicId: string; photoKey: string | null; photoUpdatedAt: Date | null }): string | null {
  if (!row.photoKey) return null;
  const v = row.photoUpdatedAt ? new Date(row.photoUpdatedAt).getTime() : 0;
  return `/public/caregivers/${encodeURIComponent(row.publicId)}/photo?v=${v}`;
}

const PHOTO_COLUMNS = {
  id: caregivers.id,
  userId: caregivers.userId,
  publicId: caregivers.publicId,
  photoKey: caregivers.photoKey,
  photoMimeType: caregivers.photoMimeType,
  photoUpdatedAt: caregivers.photoUpdatedAt,
  pendingPhotoKey: caregivers.pendingPhotoKey,
  pendingPhotoMimeType: caregivers.pendingPhotoMimeType,
  pendingPhotoAt: caregivers.pendingPhotoAt,
  photoRejectedAt: caregivers.photoRejectedAt,
  photoRejectionReason: caregivers.photoRejectionReason,
  deletedAt: caregivers.deletedAt,
};
interface PhotoRow {
  id: string;
  userId: string | null;
  publicId: string;
  photoKey: string | null;
  photoMimeType: string | null;
  photoUpdatedAt: Date | null;
  pendingPhotoKey: string | null;
  pendingPhotoMimeType: string | null;
  pendingPhotoAt: Date | null;
  photoRejectedAt: Date | null;
  photoRejectionReason: string | null;
  deletedAt: Date | null;
}

/**
 * A caregiver's profile photo, shown on the public profile and search cards
 * once staff have approved it.
 *
 * - A caregiver's upload is PENDING: kept apart from the approved photo,
 *   never served publicly, until staff approve it (it then replaces the
 *   approved one) or reject it (it is deleted and the caregiver told why).
 *   Their current approved photo stays up meanwhile.
 * - A staff upload is approved at once - staff are who would approve it.
 * - Removing takes the approved photo down and drops any pending one;
 *   either the caregiver or staff may do that without review.
 *
 * Every upload is re-encoded by preparePublicPhoto (square WebP, metadata and
 * GPS position dropped), so what is served is always bytes this API made.
 * The public copy is only served while the caregiver is publicly listed -
 * the same rule search uses.
 */
@Injectable()
export class CaregiverPhotoService {
  private readonly logger = new Logger(CaregiverPhotoService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Optional() private readonly notices?: NotificationsService,
  ) {}

  private async row(caregiverId: string): Promise<PhotoRow> {
    const [row] = await this.db.select(PHOTO_COLUMNS).from(caregivers).where(eq(caregivers.id, caregiverId)).limit(1);
    if (!row || row.deletedAt) throw new NotFoundException('Caregiver not found');
    return row;
  }

  private state(row: PhotoRow): CaregiverPhotoState {
    return {
      hasPhoto: Boolean(row.photoKey),
      photoUrl: publicPhotoUrl(row),
      photoUpdatedAt: row.photoKey ? row.photoUpdatedAt : null,
      pending: row.pendingPhotoKey ? { uploadedAt: row.pendingPhotoAt } : null,
      rejected: !row.pendingPhotoKey && row.photoRejectedAt ? { at: row.photoRejectedAt, reason: row.photoRejectionReason } : null,
    };
  }

  private async drop(key: string | null | undefined) {
    if (key) await this.storage.delete(key).catch(() => undefined);
  }

  async get(caregiverId: string): Promise<CaregiverPhotoState> {
    return this.state(await this.row(caregiverId));
  }

  async upload(caregiverId: string, file: Express.Multer.File | undefined, actor: PhotoActor): Promise<CaregiverPhotoState> {
    if (!file) throw new BadRequestException('Choose a photo to upload.');
    const row = await this.row(caregiverId);
    // An account on its way to erasure gets no new personal data.
    await assertNoPendingDeletion(this.db, { caregiverId });
    const photo = await preparePublicPhoto(file);
    const key = `caregiver-photos/${caregiverId}/${uuid()}.webp`;
    await this.storage.upload({ key, buffer: photo.buffer, mimeType: photo.mimeType });
    const now = new Date();

    if (actor === 'STAFF') {
      // Approved as it lands; a pending upload it supersedes goes too.
      await this.db
        .update(caregivers)
        .set({
          photoKey: key,
          photoMimeType: photo.mimeType,
          photoUpdatedAt: now,
          pendingPhotoKey: null,
          pendingPhotoMimeType: null,
          pendingPhotoAt: null,
          photoRejectedAt: null,
          photoRejectionReason: null,
        })
        .where(eq(caregivers.id, caregiverId));
      // Old files only after the row points at the new one.
      await this.drop(row.photoKey);
      await this.drop(row.pendingPhotoKey);
      return this.get(caregiverId);
    }

    await this.db
      .update(caregivers)
      .set({ pendingPhotoKey: key, pendingPhotoMimeType: photo.mimeType, pendingPhotoAt: now, photoRejectedAt: null, photoRejectionReason: null })
      .where(eq(caregivers.id, caregiverId));
    // A second upload before review replaces the first.
    await this.drop(row.pendingPhotoKey);
    return this.get(caregiverId);
  }

  /** Staff: the pending photo becomes the public one. */
  async approve(caregiverId: string): Promise<CaregiverPhotoState> {
    const row = await this.row(caregiverId);
    if (!row.pendingPhotoKey) throw new BadRequestException('There is no photo waiting for approval.');
    await this.db
      .update(caregivers)
      .set({
        photoKey: row.pendingPhotoKey,
        photoMimeType: row.pendingPhotoMimeType ?? 'image/webp',
        photoUpdatedAt: new Date(),
        pendingPhotoKey: null,
        pendingPhotoMimeType: null,
        pendingPhotoAt: null,
        photoRejectedAt: null,
        photoRejectionReason: null,
      })
      .where(and(eq(caregivers.id, caregiverId), eq(caregivers.pendingPhotoKey, row.pendingPhotoKey)));
    await this.drop(row.photoKey);
    this.tell(row.userId, 'APPROVED', null);
    return this.get(caregiverId);
  }

  /** Staff: the pending photo is deleted; the caregiver is told, with the reason if given. */
  async reject(caregiverId: string, reason?: string | null): Promise<CaregiverPhotoState> {
    const row = await this.row(caregiverId);
    if (!row.pendingPhotoKey) throw new BadRequestException('There is no photo waiting for approval.');
    const why = reason?.trim().slice(0, 500) || null;
    await this.db
      .update(caregivers)
      .set({ pendingPhotoKey: null, pendingPhotoMimeType: null, pendingPhotoAt: null, photoRejectedAt: new Date(), photoRejectionReason: why })
      .where(and(eq(caregivers.id, caregiverId), eq(caregivers.pendingPhotoKey, row.pendingPhotoKey)));
    await this.drop(row.pendingPhotoKey);
    this.tell(row.userId, 'REJECTED', why);
    return this.get(caregiverId);
  }

  /** Takes the approved photo down and drops a pending one. Caregiver or staff; no review. */
  async remove(caregiverId: string): Promise<CaregiverPhotoState> {
    const row = await this.row(caregiverId);
    if (row.photoKey || row.pendingPhotoKey) {
      await this.db
        .update(caregivers)
        .set({
          photoKey: null,
          photoMimeType: null,
          photoUpdatedAt: new Date(),
          pendingPhotoKey: null,
          pendingPhotoMimeType: null,
          pendingPhotoAt: null,
        })
        .where(eq(caregivers.id, caregiverId));
      await this.drop(row.photoKey);
      await this.drop(row.pendingPhotoKey);
    }
    return this.get(caregiverId);
  }

  /** The bytes, for the caregiver themselves or staff - whatever the caregiver's status. */
  async file(caregiverId: string, which: 'approved' | 'pending' = 'approved'): Promise<{ buffer: Buffer; mimeType: string }> {
    const row = await this.row(caregiverId);
    const key = which === 'pending' ? row.pendingPhotoKey : row.photoKey;
    if (!key) throw new NotFoundException('No photo');
    const mimeType = (which === 'pending' ? row.pendingPhotoMimeType : row.photoMimeType) ?? 'image/webp';
    return { buffer: await this.storage.download(key), mimeType };
  }

  /** Staff "Photos to approve": oldest first, so nobody waits longest. */
  async listPending(): Promise<PendingPhotoItem[]> {
    const rows = await this.db
      .select({
        caregiverId: caregivers.id,
        fullName: caregivers.fullName,
        registrationNumber: caregivers.registrationNumber,
        uploadedAt: caregivers.pendingPhotoAt,
        photoKey: caregivers.photoKey,
      })
      .from(caregivers)
      .where(and(isNotNull(caregivers.pendingPhotoKey), isNull(caregivers.deletedAt)))
      .orderBy(asc(caregivers.pendingPhotoAt));
    return rows.map(({ photoKey, ...r }) => ({ ...r, hasApprovedPhoto: Boolean(photoKey) }));
  }

  /**
   * The approved bytes for the public site, by publicId. One 404 for "no
   * such caregiver", "not listed" and "no photo", like the profile endpoint.
   * A pending photo is never served here.
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

  /** The caregiver hears the outcome in the app and on the website. Never throws. */
  private tell(userId: string | null, outcome: 'APPROVED' | 'REJECTED', reason: string | null) {
    if (!userId || !this.notices) return;
    try {
      this.notices.notify([userId], (lang) => photoReviewedNotice(outcome, reason, lang), '/profile', `photo ${outcome.toLowerCase()}`, {
        category: 'DOCUMENT',
        important: outcome === 'REJECTED',
      });
    } catch (err) {
      this.logger.warn(`Photo notice failed: ${(err as Error).message}`);
    }
  }
}
