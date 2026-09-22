import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@repo/db';
import type { OwnerContextService } from '../owner/owner-context.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { GalleryService } from './gallery.service.js';

const PASSWORD = 'galpass1';
const OWNER = 'owner_a';

function setup(options: { downloadsEnabled?: boolean; r2Key?: string | null; status?: string } = {}) {
  const gallery = {
    id: 'gal_1',
    passwordHash: bcrypt.hashSync(PASSWORD, 4),
    downloadsEnabled: options.downloadsEnabled ?? false,
    booking: { ownerId: OWNER },
  };
  const media = {
    id: 'media_1',
    galleryId: 'gal_1',
    fileName: 'DSC_0042.NEF',
    r2Key: options.r2Key === undefined ? 'originals/gal_1/media_1-DSC_0042.NEF' : options.r2Key,
    processingStatus: options.status ?? 'ready',
    gallery,
  };
  const prisma = {
    gallery: {
      findUnique: vi.fn(async () => gallery),
      update: vi.fn(async ({ data }) => ({ ...gallery, ...data })),
    },
    media: { findUnique: vi.fn(async () => media) },
  };
  const storage = {
    getPresignedDownloadUrl: vi.fn(async () => 'https://storage.example/signed'),
    getObjectSize: vi.fn(async () => 24_000_000),
    publicUrl: (key: string) => `https://cdn.example/${key}`,
  };
  const service = new GalleryService(
    prisma as unknown as PrismaClient,
    { getOwnerId: async () => OWNER } as OwnerContextService,
    storage as unknown as StorageService,
  );
  return { prisma, storage, service };
}

describe('GalleryService download release', () => {
  it('refuses downloads until the owner releases them', async () => {
    const { storage, service } = setup({ downloadsEnabled: false });

    await expect(service.getDownloadUrl('media_1', PASSWORD)).rejects.toThrow(ForbiddenException);
    expect(storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('hands out a signed link with the original filename once released', async () => {
    const { storage, service } = setup({ downloadsEnabled: true });

    const result = await service.getDownloadUrl('media_1', PASSWORD);

    expect(result).toEqual({
      url: 'https://storage.example/signed',
      fileName: 'DSC_0042.NEF',
      sizeBytes: 24_000_000,
    });
    expect(storage.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'originals/gal_1/media_1-DSC_0042.NEF',
      'DSC_0042.NEF',
    );
  });

  // The gallery password is the only thing standing between a stranger and
  // the originals, so it is checked before the release flag is consulted.
  it('still requires the gallery password when downloads are released', async () => {
    const { storage, service } = setup({ downloadsEnabled: true });

    await expect(service.getDownloadUrl('media_1', 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('has nothing to hand over for a Mux video or an unfinished upload', async () => {
    const noOriginal = setup({ downloadsEnabled: true, r2Key: null });
    await expect(noOriginal.service.getDownloadUrl('media_1', PASSWORD)).rejects.toThrow(
      NotFoundException,
    );

    const stillProcessing = setup({ downloadsEnabled: true, status: 'pending' });
    await expect(stillProcessing.service.getDownloadUrl('media_1', PASSWORD)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('marks each ready photo downloadable in the client view once released', async () => {
    const { prisma, service } = setup({ downloadsEnabled: true });
    (prisma.media as unknown as { findMany: unknown }).findMany = vi.fn(async () => [
      { id: 'm1', type: 'PHOTO', r2Key: 'originals/x', previewR2Key: 'previews/x', comments: [] },
      { id: 'm2', type: 'VIDEO', r2Key: null, previewR2Key: null, comments: [] },
    ]);

    const view = await service.getPublicView('gal_1', PASSWORD);

    expect(view.downloadsEnabled).toBe(true);
    expect(view.media.map((m) => m.canDownload)).toEqual([true, false]);
  });

  it('lets only the owning studio flip the switch', async () => {
    const { prisma, service } = setup();
    prisma.gallery.findUnique.mockResolvedValueOnce({
      id: 'gal_1',
      passwordHash: 'x',
      downloadsEnabled: false,
      booking: { ownerId: 'someone_else' },
    } as never);

    await expect(service.setDownloadsEnabled('gal_1', true)).rejects.toThrow(NotFoundException);
  });
});
