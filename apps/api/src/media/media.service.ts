import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { AddMediaCommentDto, UploadInitDto, UploadInitResponse } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { GalleryService } from '../gallery/gallery.service.js';
import { MuxService } from '../storage/mux.service.js';
import { StorageService } from '../storage/storage.service.js';
import { WatermarkService } from '../storage/watermark.service.js';

@Injectable()
export class MediaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly mux: MuxService,
    private readonly watermark: WatermarkService,
    private readonly galleryService: GalleryService,
  ) {}

  async initUpload(dto: UploadInitDto): Promise<UploadInitResponse> {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: dto.galleryId },
    });
    if (!gallery) throw new NotFoundException('Gallery not found');

    const isVideo = dto.mimeType.startsWith('video/');

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
    const uploadUrl = await this.storage.createPresignedPutUrl(key, dto.mimeType);
    await this.prisma.media.update({ where: { id: media.id }, data: { r2Key: key } });

    return { kind: 'r2_put', mediaId: media.id, uploadUrl };
  }

  async completeUpload(mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media not found');
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
