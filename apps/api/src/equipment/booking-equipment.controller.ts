import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { assignEquipmentToBookingSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { EquipmentService } from './equipment.service.js';

@Controller('bookings/:bookingId/equipment')
export class BookingEquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  list(@Param('bookingId') bookingId: string) {
    return this.equipmentService.listForBooking(bookingId);
  }

  @Post()
  assign(
    @Param('bookingId') bookingId: string,
    @Body(new ZodValidationPipe(assignEquipmentToBookingSchema))
    body: ReturnType<typeof assignEquipmentToBookingSchema.parse>,
  ) {
    return this.equipmentService.assignToBooking(bookingId, body.equipmentId);
  }

  @Delete(':equipmentId')
  unassign(
    @Param('bookingId') bookingId: string,
    @Param('equipmentId') equipmentId: string,
  ) {
    return this.equipmentService.unassignFromBooking(bookingId, equipmentId);
  }
}
