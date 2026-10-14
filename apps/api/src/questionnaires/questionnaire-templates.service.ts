import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { CreateQuestionnaireTemplateDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

@Injectable()
export class QuestionnaireTemplatesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async list() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.questionnaireTemplate.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateQuestionnaireTemplateDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.questionnaireTemplate.create({
      data: { ownerId, name: dto.name, schema: dto.fields },
    });
  }

  async delete(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const template = await this.prisma.questionnaireTemplate.findFirst({
      where: { id, ownerId },
    });
    if (!template) throw new NotFoundException('Questionnaire template not found');

    // Each questionnaire sent from this template keeps pointing at it (the public
    // page shows its name), so the database refuses the delete. Say so
    // instead of letting that surface as a 500.
    const inUse = await this.prisma.questionnaireResponse.count({ where: { templateId: id } });
    if (inUse > 0) {
      throw new ConflictException(
        `This template is used by ${inUse} questionnaire${inUse === 1 ? '' : 's'} and can't be deleted`,
      );
    }
    await this.prisma.questionnaireTemplate.delete({ where: { id } });
    return { id };
  }
}
