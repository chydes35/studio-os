import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { StorageService } from '../storage/storage.service.js';
import { GalleryPasswordLimiter } from './gallery-password-limiter.js';

@Injectable()
export class GalleryService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
    private readonly storage: StorageService,
    private readonly passwordLimiter: GalleryPasswordLimiter,
  ) {}

  async createForBooking(bookingId: string, password: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const existing = await this.prisma.gallery.findUnique({
      where: { bookingId },
    });
    if (existing) {
      throw new ConflictException('This booking already has a gallery');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.gallery.create({ data: { bookingId, passwordHash } });
  }

  async getForBookingOwnerView(bookingId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const gallery = await this.prisma.gallery.findUnique({
      where: { bookingId },
      include: { media: { include: { comments: true }, orderBy: { createdAt: 'desc' } } },
    });
    if (!gallery) return null;

    return {
      ...gallery,
      media: gallery.media.map((m) => ({
        ...m,
        previewUrl: m.previewR2Key ? this.storage.publicUrl(m.previewR2Key) : null,
      })),
    };
  }

  /**
   * Every client action re-sends the password, so this is the single place
   * guesses are counted (see GalleryPasswordLimiter).
   */
  private async verifyPassword(galleryId: string, password: string, clientIp: string) {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
    });
    if (!gallery) throw new NotFoundException('Gallery not found');
    this.passwordLimiter.assertAllowed(galleryId, clientIp);
    const valid = await bcrypt.compare(password, gallery.passwordHash);
    if (!valid) {
      this.passwordLimiter.recordFailure(galleryId, clientIp);
      throw new UnauthorizedException('Incorrect password');
    }
    this.passwordLimiter.recordSuccess(galleryId, clientIp);
    return gallery;
  }

  async getPublicView(galleryId: string, password: string, clientIp = 'unknown') {
    const gallery = await this.verifyPassword(galleryId, password, clientIp);
    const media = await this.prisma.media.findMany({
      where: { galleryId: gallery.id, processingStatus: 'ready' },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: gallery.id,
      downloadsEnabled: gallery.downloadsEnabled,
      media: media.map((m) => ({
        id: m.id,
        type: m.type,
        isFavorited: m.isFavorited,
        previewUrl: m.previewR2Key ? this.storage.publicUrl(m.previewR2Key) : null,
        muxPlaybackId: m.muxPlaybackId,
        // Only R2-backed photos have an original to hand over; Mux video is
        // streamed, not downloaded.
        canDownload: gallery.downloadsEnabled && Boolean(m.r2Key),
        comments: m.comments,
      })),
    };
  }

  /** Owner switch that releases full-resolution originals to the client. */
  async setDownloadsEnabled(galleryId: string, enabled: boolean) {
    const ownerId = await this.ownerContext.getOwnerId();
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
      include: { booking: true },
    });
    if (!gallery || gallery.booking.ownerId !== ownerId) {
      throw new NotFoundException('Gallery not found');
    }
    return this.prisma.gallery.update({
      where: { id: galleryId },
      data: { downloadsEnabled: enabled },
    });
  }

  /**
   * Client-facing download of the untouched original. Password-gated like
   * every other client action, and refused unless the owner has released
   * downloads for this gallery — the previews are watermarked precisely so
   * the originals stay withheld until then.
   */
  async getDownloadUrl(mediaId: string, password: string, clientIp = 'unknown') {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      include: { gallery: true },
    });
    if (!media) throw new NotFoundException('Media not found');
    await this.verifyPassword(media.galleryId, password, clientIp);

    if (!media.gallery.downloadsEnabled) {
      throw new ForbiddenException(
        'Downloads for this gallery have not been released yet. Please contact your photographer.',
      );
    }
    if (!media.r2Key || media.processingStatus !== 'ready') {
      throw new NotFoundException('This file is not available for download');
    }

    const fileName = media.fileName ?? `${media.id}.jpg`;
    const [url, sizeBytes] = await Promise.all([
      this.storage.getPresignedDownloadUrl(media.r2Key, fileName),
      this.storage.getObjectSize(media.r2Key),
    ]);
    return { url, fileName, sizeBytes };
  }

  async verifyMediaGalleryPassword(mediaId: string, password: string, clientIp = 'unknown') {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media not found');
    await this.verifyPassword(media.galleryId, password, clientIp);
    return media;
  }
}
