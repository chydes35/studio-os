import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { CreateExpenseDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async list() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.expense.findMany({
      where: { ownerId },
      orderBy: { incurredAt: 'desc' },
    });
  }

  async create(dto: CreateExpenseDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.expense.create({ data: { ...dto, ownerId } });
  }

  async delete(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const expense = await this.prisma.expense.findFirst({ where: { id, ownerId } });
    if (!expense) throw new NotFoundException('Expense not found');
    await this.prisma.expense.delete({ where: { id } });
    return { id };
  }
}
