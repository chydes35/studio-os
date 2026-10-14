import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { createClientSchema, updateClientSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ClientsService } from './clients.service.js';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list() {
    return this.clientsService.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createClientSchema))
    body: ReturnType<typeof createClientSchema.parse>,
  ) {
    return this.clientsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema))
    body: ReturnType<typeof updateClientSchema.parse>,
  ) {
    return this.clientsService.update(id, body);
  }
}
