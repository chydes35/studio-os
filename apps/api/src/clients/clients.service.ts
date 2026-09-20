import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { CreateClientDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

@Injectable()
export class ClientsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async list() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.client.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateClientDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.client.create({ data: { ...dto, ownerId } });
  }

  async findOne(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const client = await this.prisma.client.findFirst({
      where: { id, ownerId },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }
}
