import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { CreateContractTemplateDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

@Injectable()
export class ContractTemplatesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async list() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.contractTemplate.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateContractTemplateDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.contractTemplate.create({ data: { ...dto, ownerId } });
  }

  async findOne(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id, ownerId },
    });
    if (!template) throw new NotFoundException('Contract template not found');
    return template;
  }

  async delete(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id, ownerId },
    });
    if (!template) throw new NotFoundException('Contract template not found');
    await this.prisma.contractTemplate.delete({ where: { id } });
    return { id };
  }
}
