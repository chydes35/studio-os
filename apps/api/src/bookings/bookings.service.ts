import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { BookingStage, CreateBookingDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async list() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.booking.findMany({
      where: { ownerId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateBookingDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.booking.create({
      data: { ...dto, ownerId },
      include: { client: true },
    });
  }

  async updateStage(id: string, stage: BookingStage) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return this.prisma.booking.update({
      where: { id },
      data: { stage },
      include: { client: true },
    });
  }
}
