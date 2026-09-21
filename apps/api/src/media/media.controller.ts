import { Controller, Param, Post, Body } from '@nestjs/common';
import { addMediaCommentSchema, toggleFavoriteSchema, uploadInitSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { MediaService } from './media.service.js';

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

  @Public()
  @Post(':id/favorite')
  toggleFavorite(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(toggleFavoriteSchema))
    body: ReturnType<typeof toggleFavoriteSchema.parse>,
  ) {
    return this.mediaService.toggleFavorite(id, body.password);
  }

  @Public()
  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addMediaCommentSchema))
    body: ReturnType<typeof addMediaCommentSchema.parse>,
  ) {
    return this.mediaService.addComment(id, body);
  }
}
