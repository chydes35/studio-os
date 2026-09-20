import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { SubmitQuestionnaireDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

@Injectable()
export class QuestionnairesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async assignToBooking(bookingId: string, templateId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const template = await this.prisma.questionnaireTemplate.findFirst({
      where: { id: templateId, ownerId },
    });
    if (!template) throw new NotFoundException('Questionnaire template not found');

    return this.prisma.questionnaireResponse.create({
      data: { bookingId, templateId, answers: {} },
      include: { template: true },
    });
  }

  async listForBookingOwnerView(bookingId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    return this.prisma.questionnaireResponse.findMany({
      where: { bookingId },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPublicView(id: string) {
    const response = await this.prisma.questionnaireResponse.findUnique({
      where: { id },
      include: { template: true },
    });
    if (!response) throw new NotFoundException('Questionnaire not found');
    return {
      id: response.id,
      templateName: response.template.name,
      fields: response.template.schema,
      answers: response.answers,
      submittedAt: response.submittedAt,
    };
  }

  async submit(id: string, dto: SubmitQuestionnaireDto) {
    const response = await this.prisma.questionnaireResponse.findUnique({ where: { id } });
    if (!response) throw new NotFoundException('Questionnaire not found');
    if (response.submittedAt) {
      throw new ConflictException('This questionnaire has already been submitted');
    }

    return this.prisma.questionnaireResponse.update({
      where: { id },
      data: { answers: dto.answers, submittedAt: new Date() },
      include: { template: true },
    });
  }
}
