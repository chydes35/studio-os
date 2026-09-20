import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import { SlotsService } from './slots.service.js';

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService, SlotsService],
  exports: [SlotsService],
})
export class AvailabilityModule {}
