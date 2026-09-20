import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { createEquipmentSchema, updateEquipmentSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { EquipmentService } from './equipment.service.js';

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  list() {
    return this.equipmentService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createEquipmentSchema))
    body: ReturnType<typeof createEquipmentSchema.parse>,
  ) {
    return this.equipmentService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEquipmentSchema))
    body: ReturnType<typeof updateEquipmentSchema.parse>,
  ) {
    return this.equipmentService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.equipmentService.delete(id);
  }
}
