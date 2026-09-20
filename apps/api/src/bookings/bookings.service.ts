import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type {
  BookingStage,
  CreateBookingDto,
  PublicBookingRequestDto,
} from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { SlotsService } from '../availability/slots.service.js';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
    private readonly slotsService: SlotsService,
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

  async createPublicRequest(dto: PublicBookingRequestDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    const dateStr = dto.scheduledAt.toISOString().slice(0, 10);
    const availableSlots = await this.slotsService.getAvailableSlots(
      dateStr,
      dto.durationMins,
    );
    const requestedIso = dto.scheduledAt.toISOString();
    if (!availableSlots.includes(requestedIso)) {
      throw new BadRequestException(
        'That time slot is no longer available. Please pick another.',
      );
    }

    const client = await this.prisma.client.upsert({
      where: { ownerId_email: { email: dto.clientEmail, ownerId } },
      update: { name: dto.clientName, phone: dto.clientPhone },
      create: {
        ownerId,
        name: dto.clientName,
        email: dto.clientEmail,
        phone: dto.clientPhone,
        source: 'Booking portal',
      },
    });

    return this.prisma.booking.create({
      data: {
        ownerId,
        clientId: client.id,
        shootType: dto.shootType,
        stage: 'INQUIRY',
        scheduledAt: dto.scheduledAt,
        durationMins: dto.durationMins,
        notes: dto.notes,
      },
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
