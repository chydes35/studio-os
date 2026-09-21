import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { createGallerySchema, unlockGallerySchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { GalleryService } from './gallery.service.js';

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

  @Public()
  @Post('gallery/:galleryId/view')
  viewGallery(
    @Param('galleryId') galleryId: string,
    @Body(new ZodValidationPipe(unlockGallerySchema))
    body: ReturnType<typeof unlockGallerySchema.parse>,
  ) {
    return this.galleryService.getPublicView(galleryId, body.password);
  }
}
