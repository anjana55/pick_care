import { BadRequestException } from '@nestjs/common';
import { CaregiverPhotoService, publicPhotoUrl } from './caregiver-photo.service';

jest.mock('../international/profile-photo', () => ({
  MAX_PHOTO_UPLOAD_BYTES: 8 * 1024 * 1024,
  preparePublicPhoto: jest.fn(async () => ({ buffer: Buffer.from('webp'), mimeType: 'image/webp' })),
}));
jest.mock('../account-deletion/pending-deletion.util', () => ({ assertNoPendingDeletion: jest.fn(async () => undefined) }));

/**
 * One caregiver row, held in memory. select() reads it, update().set()
 * merges into it - enough of Drizzle for the photo rules.
 */
function fakeDb(initial: Record<string, unknown>) {
  const row: Record<string, unknown> = {
    id: 'cg-1',
    userId: 'user-1',
    publicId: 'pub-1',
    photoKey: null,
    photoMimeType: null,
    photoUpdatedAt: null,
    pendingPhotoKey: null,
    pendingPhotoMimeType: null,
    pendingPhotoAt: null,
    photoRejectedAt: null,
    photoRejectionReason: null,
    deletedAt: null,
    ...initial,
  };
  const chain = { from: () => chain, where: () => chain, limit: async () => [{ ...row }] };
  const db = {
    select: () => chain,
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => Object.assign(row, values) }) }),
  };
  return { db, row };
}

const storage = () => ({ upload: jest.fn(async () => undefined), delete: jest.fn(async () => undefined), download: jest.fn(async () => Buffer.from('x')) });
const file = { buffer: Buffer.from('jpg'), mimetype: 'image/jpeg', size: 3 } as Express.Multer.File;

describe('CaregiverPhotoService approval', () => {
  it("holds a caregiver's upload for approval and keeps the approved photo up", async () => {
    const { db, row } = fakeDb({ photoKey: 'old.webp', photoUpdatedAt: new Date(1) });
    const store = storage();
    const svc = new CaregiverPhotoService(db as never, store as never);

    const state = await svc.upload('cg-1', file, 'CAREGIVER');

    expect(row.photoKey).toBe('old.webp');
    expect(row.pendingPhotoKey).toMatch(/^caregiver-photos\/cg-1\/.+\.webp$/);
    expect(state.hasPhoto).toBe(true);
    expect(state.pending).not.toBeNull();
    expect(store.delete).not.toHaveBeenCalledWith('old.webp');
  });

  it('puts a staff upload live at once and drops a pending one', async () => {
    const { db, row } = fakeDb({ photoKey: 'old.webp', pendingPhotoKey: 'pending.webp' });
    const store = storage();
    const svc = new CaregiverPhotoService(db as never, store as never);

    const state = await svc.upload('cg-1', file, 'STAFF');

    expect(row.photoKey).toMatch(/^caregiver-photos\/cg-1\//);
    expect(row.pendingPhotoKey).toBeNull();
    expect(state.pending).toBeNull();
    expect(store.delete).toHaveBeenCalledWith('old.webp');
    expect(store.delete).toHaveBeenCalledWith('pending.webp');
  });

  it('approving makes the pending photo the public one and tells the caregiver', async () => {
    const { db, row } = fakeDb({ photoKey: 'old.webp', pendingPhotoKey: 'new.webp', pendingPhotoMimeType: 'image/webp' });
    const store = storage();
    const notices = { notify: jest.fn() };
    const svc = new CaregiverPhotoService(db as never, store as never, notices as never);

    const state = await svc.approve('cg-1');

    expect(row.photoKey).toBe('new.webp');
    expect(row.pendingPhotoKey).toBeNull();
    expect(state.photoUrl).toMatch(/^\/public\/caregivers\/pub-1\/photo\?v=\d+$/);
    expect(store.delete).toHaveBeenCalledWith('old.webp');
    expect(notices.notify).toHaveBeenCalledWith(['user-1'], expect.any(Function), '/profile', 'photo approved', expect.anything());
  });

  it('rejecting deletes the pending photo, keeps the reason, and leaves the approved one', async () => {
    const { db, row } = fakeDb({ photoKey: 'old.webp', pendingPhotoKey: 'new.webp' });
    const store = storage();
    const notices = { notify: jest.fn() };
    const svc = new CaregiverPhotoService(db as never, store as never, notices as never);

    const state = await svc.reject('cg-1', '  Face not visible  ');

    expect(row.photoKey).toBe('old.webp');
    expect(row.pendingPhotoKey).toBeNull();
    expect(state.rejected?.reason).toBe('Face not visible');
    expect(store.delete).toHaveBeenCalledWith('new.webp');
    const build = notices.notify.mock.calls[0][1] as (lang: string) => { body: string };
    expect(build('en').body).toContain('Face not visible');
  });

  it('refuses to approve or reject when nothing is waiting', async () => {
    const svc = new CaregiverPhotoService(fakeDb({}).db as never, storage() as never);
    await expect(svc.approve('cg-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.reject('cg-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never serves a pending photo as the public URL', () => {
    expect(publicPhotoUrl({ publicId: 'p', photoKey: null, photoUpdatedAt: null })).toBeNull();
  });
});
