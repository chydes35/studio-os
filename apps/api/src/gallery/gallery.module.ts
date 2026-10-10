import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller.js';
import { GalleryPasswordLimiter } from './gallery-password-limiter.js';
import { GalleryService } from './gallery.service.js';

@Module({
  controllers: [GalleryController],
  providers: [GalleryService, GalleryPasswordLimiter],
  exports: [GalleryService],
})
export class GalleryModule {}
