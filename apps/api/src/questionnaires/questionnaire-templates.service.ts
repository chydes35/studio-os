import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
    await this.prisma.questionnaireTemplate.delete({ where: { id } });
    return { id };
  }
}
