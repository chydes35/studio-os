import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { assignQuestionnaireSchema, submitQuestionnaireSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { QuestionnairesService } from './questionnaires.service.js';

@Controller()
export class QuestionnairesController {
  constructor(private readonly questionnairesService: QuestionnairesService) {}

  @Post('bookings/:bookingId/questionnaires')
  assign(
    @Param('bookingId') bookingId: string,
    @Body(new ZodValidationPipe(assignQuestionnaireSchema))
    body: ReturnType<typeof assignQuestionnaireSchema.parse>,
  ) {
    return this.questionnairesService.assignToBooking(bookingId, body.templateId);
  }

  @Get('bookings/:bookingId/questionnaires')
  listForBooking(@Param('bookingId') bookingId: string) {
    return this.questionnairesService.listForBookingOwnerView(bookingId);
  }

  @Public()
  @Get('questionnaire-responses/:id')
  getPublicView(@Param('id') id: string) {
    return this.questionnairesService.getPublicView(id);
  }

  @Public()
  @Post('questionnaire-responses/:id/submit')
  submit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(submitQuestionnaireSchema))
    body: ReturnType<typeof submitQuestionnaireSchema.parse>,
  ) {
    return this.questionnairesService.submit(id, body);
  }
}
