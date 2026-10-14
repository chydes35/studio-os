import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  availableSlotsQuerySchema,
  createAvailabilityRuleSchema,
  createCalendarBlockSchema,
  ownerAvailableSlotsQuerySchema,
} from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { AvailabilityService } from './availability.service.js';
import { SlotsService } from './slots.service.js';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../rate-limit/rate-limit.module.js';

@Controller('availability')
export class AvailabilityController {
  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly slotsService: SlotsService,
  ) {}

  @Get('rules')
  listRules() {
    return this.availabilityService.listRules();
  }

  @Post('rules')
  createRule(
    @Body(new ZodValidationPipe(createAvailabilityRuleSchema))
    body: ReturnType<typeof createAvailabilityRuleSchema.parse>,
  ) {
    return this.availabilityService.createRule(body);
  }

  @Delete('rules/:id')
  deleteRule(@Param('id') id: string) {
    return this.availabilityService.deleteRule(id);
  }

  @Get('blocks')
  listBlocks() {
    return this.availabilityService.listBlocks();
  }

  @Get('owner-slots')
  getOwnerSlots(
    @Query(new ZodValidationPipe(ownerAvailableSlotsQuerySchema))
    query: ReturnType<typeof ownerAvailableSlotsQuerySchema.parse>,
  ) {
    return this.availabilityService.getOwnerSlots(query);
  }

  @Post('blocks')
  createBlock(
    @Body(new ZodValidationPipe(createCalendarBlockSchema))
    body: ReturnType<typeof createCalendarBlockSchema.parse>,
  ) {
    return this.availabilityService.createBlock(body);
  }

  @Delete('blocks/:id')
  deleteBlock(@Param('id') id: string) {
    return this.availabilityService.deleteBlock(id);
  }

  /** Public booking portal only — the owner dashboard never calls this. */
  @Public()
  @Throttle({ default: RATE_LIMITS.publicSlots })
  @Get('slots/:ownerId')
  getSlots(
    @Param('ownerId') ownerId: string,
    @Query(new ZodValidationPipe(availableSlotsQuerySchema))
    query: ReturnType<typeof availableSlotsQuerySchema.parse>,
  ) {
    return this.slotsService.getAvailableSlots(ownerId, query.date, query.durationMins);
  }
}
