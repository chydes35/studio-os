import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type {
  CreateAvailabilityRuleDto,
  CreateCalendarBlockDto,
} from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async listRules() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.availabilityRule.findMany({
      where: { ownerId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createRule(dto: CreateAvailabilityRuleDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.availabilityRule.create({ data: { ...dto, ownerId } });
  }

  async deleteRule(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const rule = await this.prisma.availabilityRule.findFirst({
      where: { id, ownerId },
    });
    if (!rule) throw new NotFoundException('Availability rule not found');
    await this.prisma.availabilityRule.delete({ where: { id } });
    return { id };
  }

  async listBlocks() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.calendarBlock.findMany({
      where: { ownerId },
      orderBy: { startsAt: 'asc' },
    });
  }

  async createBlock(dto: CreateCalendarBlockDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.calendarBlock.create({
      data: { ...dto, ownerId, source: 'manual' },
    });
  }

  async deleteBlock(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const block = await this.prisma.calendarBlock.findFirst({
      where: { id, ownerId },
    });
    if (!block) throw new NotFoundException('Calendar block not found');
    await this.prisma.calendarBlock.delete({ where: { id } });
    return { id };
  }
}
