import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { createContractTemplateSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ContractTemplatesService } from './contract-templates.service.js';

@Controller('contract-templates')
export class ContractTemplatesController {
  constructor(private readonly templatesService: ContractTemplatesService) {}

  @Get()
  list() {
    return this.templatesService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createContractTemplateSchema))
    body: ReturnType<typeof createContractTemplateSchema.parse>,
  ) {
    return this.templatesService.create(body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.templatesService.delete(id);
  }
}
