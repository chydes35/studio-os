import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { createQuestionnaireTemplateSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { QuestionnaireTemplatesService } from './questionnaire-templates.service.js';

@Controller('questionnaire-templates')
export class QuestionnaireTemplatesController {
  constructor(private readonly templatesService: QuestionnaireTemplatesService) {}

  @Get()
  list() {
    return this.templatesService.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createQuestionnaireTemplateSchema))
    body: ReturnType<typeof createQuestionnaireTemplateSchema.parse>,
  ) {
    return this.templatesService.create(body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.templatesService.delete(id);
  }
}
