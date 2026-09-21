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
import { zonedDateStr } from '../availability/zoned-time.js';

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

  async findOne(id: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id, ownerId },
      include: { client: true, location: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async create(dto: CreateBookingDto) {
    const ownerId = await this.ownerContext.getOwnerId();

    // The ids in the body are client-supplied: without these checks an owner
    // could attach another studio's client/location to their own booking and
    // read it back through the booking's `include`.
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, ownerId },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, ownerId },
      });
      if (!location) throw new NotFoundException('Location not found');
    }

    return this.prisma.booking.create({
      data: { ...dto, ownerId },
      include: { client: true },
    });
  }

  /**
   * Public booking portal — `ownerId` comes from the portal's own URL,
   * there's no logged-in user on this request.
   *
   * The availability re-check and the insert run in one transaction holding
   * a per-owner advisory lock, so concurrent requests for the same studio are
   * serialized: without it, N simultaneous requests for one slot all passed
   * the check before any of them inserted, and all N were booked.
   */
  async createPublicRequest(ownerId: string, dto: PublicBookingRequestDto) {
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) throw new NotFoundException('Booking page not found');

    // The slot's calendar date in the *studio's* zone. Using the UTC date
    // (`toISOString().slice(0, 10)`) put every slot at/after 00:00Z — e.g.
    // 7pm+ in Chicago — on the next day, so those slots were always rejected.
    const dateStr = zonedDateStr(dto.scheduledAt, owner.timezone);
    const requestedIso = dto.scheduledAt.toISOString();

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const { slots } = await this.slotsService.getAvailableSlots(
        ownerId,
        dateStr,
        dto.durationMins,
        tx,
      );
      if (!slots.includes(requestedIso)) {
        throw new BadRequestException(
          'That time slot is no longer available. Please pick another.',
        );
      }

      const client = await tx.client.upsert({
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

      return tx.booking.create({
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

  async updateLocation(id: string, locationId: string | null) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({ where: { id, ownerId } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: locationId, ownerId },
      });
      if (!location) throw new NotFoundException('Location not found');
    }

    return this.prisma.booking.update({
      where: { id },
      data: { locationId },
      include: { client: true, location: true },
    });
  }
}
