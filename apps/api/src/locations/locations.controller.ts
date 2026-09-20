import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { addLocationPhotoSchema, createLocationSchema, updateLocationSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LocationsService } from './locations.service.js';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  list() {
    return this.locationsService.list();
  }

  @Get('geocode')
  geocode(@Query('q') query: string) {
    return this.locationsService.geocode(query ?? '');
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createLocationSchema))
    body: ReturnType<typeof createLocationSchema.parse>,
  ) {
    return this.locationsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLocationSchema))
    body: ReturnType<typeof updateLocationSchema.parse>,
  ) {
    return this.locationsService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.locationsService.delete(id);
  }

  @Post(':id/photos')
  initPhotoUpload(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addLocationPhotoSchema))
    body: ReturnType<typeof addLocationPhotoSchema.parse>,
  ) {
    return this.locationsService.initPhotoUpload(id, body);
  }

  @Delete(':id/photos/:photoId')
  deletePhoto(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.locationsService.deletePhoto(id, photoId);
  }
}
