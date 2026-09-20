import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createBookingSchema,
  publicBookingRequestSchema,
  updateBookingStageSchema,
} from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BookingsService } from './bookings.service.js';

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

  @Post('public-request')
  createPublicRequest(
    @Body(new ZodValidationPipe(publicBookingRequestSchema))
    body: ReturnType<typeof publicBookingRequestSchema.parse>,
  ) {
    return this.bookingsService.createPublicRequest(body);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBookingStageSchema))
    body: ReturnType<typeof updateBookingStageSchema.parse>,
  ) {
    return this.bookingsService.updateStage(id, body.stage);
  }
}
