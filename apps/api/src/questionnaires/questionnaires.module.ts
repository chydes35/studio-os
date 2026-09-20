import { Module } from '@nestjs/common';
import { QuestionnaireTemplatesController } from './questionnaire-templates.controller.js';
import { QuestionnaireTemplatesService } from './questionnaire-templates.service.js';
import { QuestionnairesController } from './questionnaires.controller.js';
import { QuestionnairesService } from './questionnaires.service.js';

@Module({
  controllers: [QuestionnaireTemplatesController, QuestionnairesController],
  providers: [QuestionnaireTemplatesService, QuestionnairesService],
})
export class QuestionnairesModule {}
