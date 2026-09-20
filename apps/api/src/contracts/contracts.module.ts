import { Module } from '@nestjs/common';
import { ContractTemplatesController } from './contract-templates.controller.js';
import { ContractTemplatesService } from './contract-templates.service.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { PdfService } from './pdf.service.js';

@Module({
  controllers: [ContractTemplatesController, ContractsController],
  providers: [ContractTemplatesService, ContractsService, PdfService],
})
export class ContractsModule {}
