import {
  ConflictException,
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

@Injectable()
export class GalleryService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
    private readonly storage: StorageService,
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

  private async verifyPassword(galleryId: string, password: string) {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
    });
    if (!gallery) throw new NotFoundException('Gallery not found');
    const valid = await bcrypt.compare(password, gallery.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect password');
    return gallery;
  }

  async getPublicView(galleryId: string, password: string) {
    const gallery = await this.verifyPassword(galleryId, password);
    const media = await this.prisma.media.findMany({
      where: { galleryId: gallery.id, processingStatus: 'ready' },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: gallery.id,
      media: media.map((m) => ({
        id: m.id,
        type: m.type,
        isFavorited: m.isFavorited,
        previewUrl: m.previewR2Key ? this.storage.publicUrl(m.previewR2Key) : null,
        muxPlaybackId: m.muxPlaybackId,
        comments: m.comments,
      })),
    };
  }

  async verifyMediaGalleryPassword(mediaId: string, password: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media not found');
    await this.verifyPassword(media.galleryId, password);
    return media;
  }
}
