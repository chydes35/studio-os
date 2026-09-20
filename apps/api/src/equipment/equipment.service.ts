import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { CreateEquipmentDto, UpdateEquipmentDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';

@Injectable()
export class EquipmentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
  ) {}

  async list() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.equipment.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateEquipmentDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.equipment.create({ data: { ...dto, ownerId } });
  }

  private async getOwned(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const equipment = await this.prisma.equipment.findFirst({ where: { id, ownerId } });
    if (!equipment) throw new NotFoundException('Equipment not found');
    return equipment;
  }

  async update(id: string, dto: UpdateEquipmentDto) {
    await this.getOwned(id);
    return this.prisma.equipment.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    await this.getOwned(id);
    await this.prisma.equipment.delete({ where: { id } });
    return { id };
  }

  async listForBooking(bookingId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, ownerId } });
    if (!booking) throw new NotFoundException('Booking not found');

    return this.prisma.bookingEquipment.findMany({
      where: { bookingId },
      include: { equipment: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async assignToBooking(bookingId: string, equipmentId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const [booking, equipment] = await Promise.all([
      this.prisma.booking.findFirst({ where: { id: bookingId, ownerId } }),
      this.prisma.equipment.findFirst({ where: { id: equipmentId, ownerId } }),
    ]);
    if (!booking) throw new NotFoundException('Booking not found');
    if (!equipment) throw new NotFoundException('Equipment not found');

    const existing = await this.prisma.bookingEquipment.findUnique({
      where: { bookingId_equipmentId: { bookingId, equipmentId } },
    });
    if (existing) throw new ConflictException('Equipment already assigned to this booking');

    return this.prisma.bookingEquipment.create({
      data: { bookingId, equipmentId },
      include: { equipment: true },
    });
  }

  async unassignFromBooking(bookingId: string, equipmentId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, ownerId } });
    if (!booking) throw new NotFoundException('Booking not found');

    const existing = await this.prisma.bookingEquipment.findUnique({
      where: { bookingId_equipmentId: { bookingId, equipmentId } },
    });
    if (!existing) throw new NotFoundException('Equipment is not assigned to this booking');

    await this.prisma.bookingEquipment.delete({ where: { id: existing.id } });
    return { bookingId, equipmentId };
  }
}
