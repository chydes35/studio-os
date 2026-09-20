import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { AddMediaCommentDto, UploadInitDto, UploadInitResponse } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { GalleryService } from '../gallery/gallery.service.js';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { MuxService } from '../storage/mux.service.js';
import { StorageService } from '../storage/storage.service.js';
import { WatermarkService } from '../storage/watermark.service.js';

// Photo uploads go straight to R2 with no transcoding, so they get a tighter
// cap than video (which Mux handles and enforces its own limits on).
const MAX_PHOTO_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_VIDEO_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

@Injectable()
export class MediaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly mux: MuxService,
    private readonly watermark: WatermarkService,
    private readonly galleryService: GalleryService,
    private readonly ownerContext: OwnerContextService,
  ) {}

  /** Only the studio owner may upload into a gallery — clients only ever read/react via the password gate. */
  private async getOwnedGalleryOrThrow(galleryId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
      include: { booking: true },
    });
    if (!gallery || gallery.booking.ownerId !== ownerId) {
      throw new NotFoundException('Gallery not found');
    }
    return gallery;
  }

  async initUpload(dto: UploadInitDto): Promise<UploadInitResponse> {
    const gallery = await this.getOwnedGalleryOrThrow(dto.galleryId);

    const isVideo = dto.mimeType.startsWith('video/');
    if (!isVideo && !dto.mimeType.startsWith('image/')) {
      throw new BadRequestException('Only image/* and video/* uploads are supported');
    }

    const maxBytes = isVideo ? MAX_VIDEO_UPLOAD_BYTES : MAX_PHOTO_UPLOAD_BYTES;
    if (dto.fileSizeBytes > maxBytes) {
      throw new BadRequestException(
        `File exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit for ${isVideo ? 'video' : 'photo'} uploads`,
      );
    }

    if (isVideo) {
      const { uploadUrl, uploadId } = await this.mux.createDirectUpload();
      const media = await this.prisma.media.create({
        data: {
          galleryId: gallery.id,
          type: 'VIDEO',
          storageProvider: 'MUX',
          fileName: dto.fileName,
          muxAssetId: uploadId,
          processingStatus: 'pending',
        },
      });
      return { kind: 'mux', mediaId: media.id, uploadUrl };
    }

    const media = await this.prisma.media.create({
      data: {
        galleryId: gallery.id,
        type: 'PHOTO',
        storageProvider: 'R2',
        fileName: dto.fileName,
        processingStatus: 'pending',
      },
    });
    const key = this.storage.originalKey(gallery.id, media.id, dto.fileName);
    const uploadUrl = await this.storage.createPresignedPutUrl(
      key,
      dto.mimeType,
      dto.fileSizeBytes,
    );
    await this.prisma.media.update({ where: { id: media.id }, data: { r2Key: key } });

    return { kind: 'r2_put', mediaId: media.id, uploadUrl };
  }

  async completeUpload(mediaId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      include: { gallery: { include: { booking: true } } },
    });
    if (!media || media.gallery.booking.ownerId !== ownerId) {
      throw new NotFoundException('Media not found');
    }
    if (media.storageProvider !== 'R2' || !media.r2Key) {
      throw new BadRequestException('Only R2-backed photo uploads use this endpoint');
    }

    const original = await this.storage.getObjectBuffer(media.r2Key);
    const watermarked = await this.watermark.applyWatermark(original);
    const previewKey = this.storage.previewKey(media.galleryId, media.id);
    await this.storage.putObjectBuffer(previewKey, watermarked, 'image/jpeg');

    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: { previewR2Key: previewKey, processingStatus: 'ready' },
    });

    return { ...updated, previewUrl: this.storage.publicUrl(previewKey) };
  }

  async toggleFavorite(mediaId: string, password: string) {
    const media = await this.galleryService.verifyMediaGalleryPassword(mediaId, password);
    return this.prisma.media.update({
      where: { id: mediaId },
      data: { isFavorited: !media.isFavorited },
    });
  }

  async addComment(mediaId: string, dto: AddMediaCommentDto) {
    await this.galleryService.verifyMediaGalleryPassword(mediaId, dto.password);
    return this.prisma.comment.create({
      data: {
        mediaId,
        authorName: dto.authorName,
        body: dto.body,
        timestampSeconds: dto.timestampSeconds,
      },
    });
  }
}
