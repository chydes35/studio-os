import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@repo/db';
import type {
  BookingStage,
  CreateBookingDto,
  PublicBookingRequestDto,
  UpdateBookingDto,
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
    return this.prisma.$transaction(async (tx) => {
      if (dto.scheduledAt && dto.durationMins) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;
        await this.assertSlotAvailable(
          tx,
          ownerId,
          dto.scheduledAt,
          dto.durationMins,
        );
      }

      // The ids in the body are client-supplied: without these checks an owner
      // could attach another studio's client/location to their own booking.
      const client = await tx.client.findFirst({
        where: { id: dto.clientId, ownerId },
      });
      if (!client) throw new NotFoundException('Client not found');
      if (dto.locationId) {
        const location = await tx.location.findFirst({
          where: { id: dto.locationId, ownerId },
        });
        if (!location) throw new NotFoundException('Location not found');
      }

      return tx.booking.create({
        data: { ...dto, ownerId },
        include: { client: true },
      });
    });
  }

  async update(id: string, dto: UpdateBookingDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.booking.findFirst({ where: { id, ownerId } });
      if (!current) throw new NotFoundException('Booking not found');

      if (dto.clientId) {
        const client = await tx.client.findFirst({
          where: { id: dto.clientId, ownerId },
          select: { id: true },
        });
        if (!client) throw new NotFoundException('Client not found');
      }

      const data: Prisma.BookingUpdateInput = {};
      if (dto.clientId !== undefined) data.client = { connect: { id: dto.clientId } };
      if (dto.shootType !== undefined) data.shootType = dto.shootType;
      if (dto.notes !== undefined) data.notes = dto.notes;

      if (dto.scheduledAt !== undefined) {
        if (dto.scheduledAt === null) {
          data.scheduledAt = null;
          data.durationMins = null;
        } else {
          const durationMins = dto.durationMins;
          if (durationMins === undefined || durationMins === null) {
            throw new BadRequestException('Choose a session length');
          }
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;
          await this.assertSlotAvailable(tx, ownerId, dto.scheduledAt, durationMins, id);
          data.scheduledAt = dto.scheduledAt;
          data.durationMins = durationMins;
        }
      }

      return tx.booking.update({
        where: { id },
        data,
        include: { client: true, location: true },
      });
    });
  }

  private async assertSlotAvailable(
    tx: Prisma.TransactionClient,
    ownerId: string,
    scheduledAt: Date,
    durationMins: number,
    excludeBookingId?: string,
  ) {
    const owner = await tx.user.findUnique({
      where: { id: ownerId },
      select: { timezone: true },
    });
    if (!owner) throw new NotFoundException('Studio not found');

    const { slots } = await this.slotsService.getAvailableSlots(
      ownerId,
      zonedDateStr(scheduledAt, owner.timezone),
      durationMins,
      tx,
      excludeBookingId,
    );
    if (!slots.includes(scheduledAt.toISOString())) {
      throw new BadRequestException(
        'That time is outside your availability or conflicts with another booking or calendar block.',
      );
    }
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

      const { clientId, submittedDetailsNote } = await this.resolvePortalClient(
        tx,
        ownerId,
        dto,
      );

      const booking = await tx.booking.create({
        data: {
          ownerId,
          clientId,
          shootType: dto.shootType,
          stage: 'INQUIRY',
          scheduledAt: dto.scheduledAt,
          durationMins: dto.durationMins,
          notes: [submittedDetailsNote, dto.notes].filter(Boolean).join('\n\n') || undefined,
        },
      });

      // This route is public. Returning the Prisma relation here exposed the
      // existing client's CRM fields to anyone who submitted that email.
      return {
        id: booking.id,
        shootType: booking.shootType,
        stage: booking.stage,
        scheduledAt: booking.scheduledAt,
        durationMins: booking.durationMins,
      };
    });
  }

  /**
   * Finds or creates the portal submitter's Client record. The portal is
   * public and unauthenticated, so an existing client's details are never
   * overwritten from it: anyone who knows a client's email could otherwise
   * alter their CRM record. If submitted details differ from what's on file,
   * they're recorded on the booking instead, for the owner to see.
   */
  private async resolvePortalClient(
    tx: Prisma.TransactionClient,
    ownerId: string,
    dto: PublicBookingRequestDto,
  ): Promise<{ clientId: string; submittedDetailsNote?: string }> {
    const existing = await tx.client.findUnique({
      where: { ownerId_email: { email: dto.clientEmail, ownerId } },
    });

    if (!existing) {
      const created = await tx.client.create({
        data: {
          ownerId,
          name: dto.clientName,
          email: dto.clientEmail,
          phone: dto.clientPhone,
          source: 'Booking portal',
        },
      });
      return { clientId: created.id };
    }

    const nameDiffers = dto.clientName !== existing.name;
    const phoneDiffers = dto.clientPhone !== existing.phone;
    if (!nameDiffers && !phoneDiffers) return { clientId: existing.id };

    const submitted = [
      nameDiffers ? `name "${dto.clientName}"` : null,
      phoneDiffers ? `phone "${dto.clientPhone}"` : null,
    ].filter(Boolean);
    return {
      clientId: existing.id,
      submittedDetailsNote: `Booking portal: submitted with ${submitted.join(' and ')}, which differs from this client's record (not changed).`,
    };
  }

  async updateStage(id: string, stage: BookingStage) {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({ where: { id, ownerId } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (
        booking.stage === 'CLOSED' &&
        stage !== 'CLOSED' &&
        booking.scheduledAt &&
        booking.scheduledAt > new Date()
      ) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;
        await this.assertSlotAvailable(
          tx,
          ownerId,
          booking.scheduledAt,
          booking.durationMins ?? 60,
          id,
        );
      }
      return tx.booking.update({
        where: { id },
        data: { stage },
        include: { client: true, location: true },
      });
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
