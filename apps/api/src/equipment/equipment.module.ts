import { Module } from '@nestjs/common';
import { BookingEquipmentController } from './booking-equipment.controller.js';
import { EquipmentController } from './equipment.controller.js';
import { EquipmentService } from './equipment.service.js';

@Module({
  controllers: [EquipmentController, BookingEquipmentController],
  providers: [EquipmentService],
  exports: [EquipmentService],
})
export class EquipmentModule {}
