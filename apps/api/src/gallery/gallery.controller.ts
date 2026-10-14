import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  createGallerySchema,
  downloadMediaSchema,
  setGalleryDownloadsSchema,
  unlockGallerySchema,
} from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { GalleryService } from './gallery.service.js';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../rate-limit/rate-limit.module.js';

@Controller()
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Post('bookings/:bookingId/gallery')
  createForBooking(
    @Param('bookingId') bookingId: string,
    @Body(new ZodValidationPipe(createGallerySchema))
    body: ReturnType<typeof createGallerySchema.parse>,
  ) {
    return this.galleryService.createForBooking(bookingId, body.password);
  }

  @Get('bookings/:bookingId/gallery')
  getForBooking(@Param('bookingId') bookingId: string) {
    return this.galleryService.getForBookingOwnerView(bookingId);
  }

  /** Owner releases (or re-hides) full-resolution downloads for a gallery. */
  @Patch('gallery/:galleryId/downloads')
  setDownloads(
    @Param('galleryId') galleryId: string,
    @Body(new ZodValidationPipe(setGalleryDownloadsSchema))
    body: ReturnType<typeof setGalleryDownloadsSchema.parse>,
  ) {
    return this.galleryService.setDownloadsEnabled(galleryId, body.enabled);
  }

  /** Client-facing: mints a short-lived link to the original file. */
  @Public()
  @Throttle({ default: RATE_LIMITS.galleryAction })
  @Post('media/:mediaId/download')
  getDownloadUrl(
    @Param('mediaId') mediaId: string,
    @Body(new ZodValidationPipe(downloadMediaSchema))
    body: ReturnType<typeof downloadMediaSchema.parse>,
    @Req() req: Request,
  ) {
    return this.galleryService.getDownloadUrl(mediaId, body.password, req.ip ?? 'unknown');
  }

  @Public()
  @Throttle({ default: RATE_LIMITS.galleryPassword })
  @Post('gallery/:galleryId/view')
  viewGallery(
    @Param('galleryId') galleryId: string,
    @Body(new ZodValidationPipe(unlockGallerySchema))
    body: ReturnType<typeof unlockGallerySchema.parse>,
    @Req() req: Request,
  ) {
    return this.galleryService.getPublicView(galleryId, body.password, req.ip ?? 'unknown');
  }
}
