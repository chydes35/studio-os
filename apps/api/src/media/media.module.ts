import { Module } from '@nestjs/common';
import { GalleryModule } from '../gallery/gallery.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [GalleryModule, JobsModule],
  controllers: [MediaController],
  providers: [MediaService],
})
export class MediaModule {}
