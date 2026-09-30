import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { GalleryService } from '../gallery/gallery.service.js';
import type { OwnerContextService } from '../owner/owner-context.service.js';
import type { MuxService } from '../storage/mux.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { JobQueueService } from '../jobs/job-queue.service.js';
import { MediaService } from './media.service.js';

const OWNER = 'owner_a';

function setup(media: Record<string, unknown> | null) {
  const prisma = { media: { findUnique: vi.fn(async () => media) } };
  const storage = {
    getPresignedDownloadUrl: vi.fn(async () => 'https://storage.example/signed'),
    getObjectSize: vi.fn(async () => 31_457_280),
  };
  const service = new MediaService(
    prisma as unknown as PrismaClient,
    storage as unknown as StorageService,
    {} as MuxService,
    {} as JobQueueService,
    {} as GalleryService,
    { getOwnerId: async () => OWNER } as OwnerContextService,
  );
  return { storage, service };
}

const ownedPhoto = {
  id: 'media_1',
  fileName: 'DSC_0042.NEF',
  r2Key: 'originals/gal_1/media_1-DSC_0042.NEF',
  processingStatus: 'ready',
  gallery: { booking: { ownerId: OWNER } },
};

describe('MediaService.getOwnerDownloadUrl', () => {
  it('returns a signed link to the studio own original', async () => {
    const { storage, service } = setup(ownedPhoto);

    await expect(service.getOwnerDownloadUrl('media_1')).resolves.toEqual({
      url: 'https://storage.example/signed',
      fileName: 'DSC_0042.NEF',
      sizeBytes: 31_457_280,
    });
    expect(storage.getPresignedDownloadUrl).toHaveBeenCalledWith(ownedPhoto.r2Key, 'DSC_0042.NEF');
  });

  // The client-facing route honours Gallery.downloadsEnabled; that switch is
  // about withholding finals from the client, never from the studio itself.
  it('ignores the client release switch', async () => {
    const { service } = setup({
      ...ownedPhoto,
      gallery: { downloadsEnabled: false, booking: { ownerId: OWNER } },
    });
    await expect(service.getOwnerDownloadUrl('media_1')).resolves.toMatchObject({
      fileName: 'DSC_0042.NEF',
    });
  });

  it('still works when watermarking failed, which is when it matters most', async () => {
    const { service } = setup({ ...ownedPhoto, processingStatus: 'failed', previewR2Key: null });
    await expect(service.getOwnerDownloadUrl('media_1')).resolves.toMatchObject({
      url: 'https://storage.example/signed',
    });
  });

  it("refuses another studio's media", async () => {
    const { storage, service } = setup({
      ...ownedPhoto,
      gallery: { booking: { ownerId: 'someone_else' } },
    });
    await expect(service.getOwnerDownloadUrl('media_1')).rejects.toThrow(NotFoundException);
    expect(storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('has nothing to return for Mux-hosted video or a missing row', async () => {
    const video = setup({ ...ownedPhoto, r2Key: null, storageProvider: 'MUX' });
    await expect(video.service.getOwnerDownloadUrl('media_1')).rejects.toThrow(NotFoundException);

    const missing = setup(null);
    await expect(missing.service.getOwnerDownloadUrl('nope')).rejects.toThrow(NotFoundException);
  });
});
