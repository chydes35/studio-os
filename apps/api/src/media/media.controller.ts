import { Controller, Get, Param, Post, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { addMediaCommentSchema, toggleFavoriteSchema, uploadInitSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { MediaService } from './media.service.js';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../rate-limit/rate-limit.module.js';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-init')
  initUpload(
    @Body(new ZodValidationPipe(uploadInitSchema))
    body: ReturnType<typeof uploadInitSchema.parse>,
  ) {
    return this.mediaService.initUpload(body);
  }

  @Post(':id/complete')
  completeUpload(@Param('id') id: string) {
    return this.mediaService.completeUpload(id);
  }

  /** Owner downloading their own original; no gallery password involved. */
  @Get(':id/original')
  getOwnerDownloadUrl(@Param('id') id: string) {
    return this.mediaService.getOwnerDownloadUrl(id);
  }

  @Public()
  @Throttle({ default: RATE_LIMITS.galleryAction })
  @Post(':id/favorite')
  toggleFavorite(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(toggleFavoriteSchema))
    body: ReturnType<typeof toggleFavoriteSchema.parse>,
    @Req() req: Request,
  ) {
    return this.mediaService.toggleFavorite(id, body.password, req.ip ?? 'unknown');
  }

  @Public()
  @Throttle({ default: RATE_LIMITS.galleryAction })
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addMediaCommentSchema))
    body: ReturnType<typeof addMediaCommentSchema.parse>,
    @Req() req: Request,
  ) {
    return this.mediaService.addComment(id, body, req.ip ?? 'unknown');
  }
}
