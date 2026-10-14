import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createBookingSchema,
  publicBookingRequestSchema,
  setBookingLocationSchema,
  updateBookingSchema,
  updateBookingStageSchema,
} from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { BookingsService } from './bookings.service.js';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../rate-limit/rate-limit.module.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list() {
    return this.bookingsService.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createBookingSchema))
    body: ReturnType<typeof createBookingSchema.parse>,
  ) {
    return this.bookingsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBookingSchema))
    body: ReturnType<typeof updateBookingSchema.parse>,
  ) {
    return this.bookingsService.update(id, body);
  }

  /** Public booking portal — `ownerId` identifies whose portal this is, no login on this request. */
  @Public()
  @Throttle({ default: RATE_LIMITS.publicBookingRequest })
  @Post('public-request/:ownerId')
  createPublicRequest(
    @Param('ownerId') ownerId: string,
    @Body(new ZodValidationPipe(publicBookingRequestSchema))
    body: ReturnType<typeof publicBookingRequestSchema.parse>,
  ) {
    return this.bookingsService.createPublicRequest(ownerId, body);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBookingStageSchema))
    body: ReturnType<typeof updateBookingStageSchema.parse>,
  ) {
    return this.bookingsService.updateStage(id, body.stage);
  }

  @Patch(':id/location')
  updateLocation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setBookingLocationSchema))
    body: ReturnType<typeof setBookingLocationSchema.parse>,
  ) {
    return this.bookingsService.updateLocation(id, body.locationId);
  }
}
