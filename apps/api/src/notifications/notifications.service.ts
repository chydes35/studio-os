import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { EmailService } from './email.service.js';

const REMINDER_DAYS_BEFORE = 3;
const OVERDUE_RESEND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SERVICE_DUE_WARNING_DAYS = 14;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
    private readonly email: EmailService,
  ) {}

  async runDailyChecks(): Promise<{
    remindersSent: number;
    overdueProcessed: number;
    equipmentAlertsSent: number;
  }> {
    const remindersSent = await this.checkShootReminders();
    const overdueProcessed = await this.checkOverdueInvoices();
    const equipmentAlertsSent = await this.checkEquipmentServiceDue();
    this.logger.log(
      `Daily checks complete: ${remindersSent} shoot reminder(s), ${overdueProcessed} overdue invoice(s), ${equipmentAlertsSent} equipment alert(s)`,
    );
    return { remindersSent, overdueProcessed, equipmentAlertsSent };
  }

  private async checkShootReminders(): Promise<number> {
    const now = new Date();
    const windowStart = startOfDay(
      new Date(now.getTime() + REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000),
    );
    const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);

    const bookings = await this.prisma.booking.findMany({
      where: {
        scheduledAt: { gte: windowStart, lt: windowEnd },
        stage: { notIn: ['CLOSED'] },
      },
      include: { client: true },
    });

    let count = 0;
    for (const booking of bookings) {
      const alreadySent = await this.prisma.emailLog.findFirst({
        where: { bookingId: booking.id, type: 'shoot_reminder' },
      });
      if (alreadySent) continue;

      const subject = `Reminder: your ${booking.shootType} shoot is in ${REMINDER_DAYS_BEFORE} days`;
      const html = `<p>Hi ${booking.client.name},</p><p>Just a reminder that your ${booking.shootType} session is scheduled for ${booking.scheduledAt?.toLocaleString()}. Looking forward to it!</p>`;
      const result = await this.email.send({ to: booking.client.email, subject, html });

      await this.prisma.emailLog.create({
        data: {
          ownerId: booking.ownerId,
          bookingId: booking.id,
          type: 'shoot_reminder',
          recipientEmail: booking.client.email,
          subject,
          body: html,
          status: result.delivered ? 'sent' : 'skipped_not_configured',
        },
      });
      count++;
    }
    return count;
  }

  private async checkOverdueInvoices(): Promise<number> {
    const now = new Date();
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueAt: { lt: now } },
      include: { booking: { include: { client: true } } },
    });

    let count = 0;
    for (const invoice of overdueInvoices) {
      if (invoice.status !== 'OVERDUE') {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'OVERDUE' },
        });
      }

      const recentReminder = await this.prisma.emailLog.findFirst({
        where: {
          bookingId: invoice.bookingId,
          type: 'invoice_overdue',
          createdAt: { gte: new Date(now.getTime() - OVERDUE_RESEND_INTERVAL_MS) },
        },
      });
      if (recentReminder) continue;

      const subject = 'Invoice past due';
      const html = `<p>Hi ${invoice.booking.client.name},</p><p>This is a reminder that your invoice${invoice.dueAt ? ` (due ${invoice.dueAt.toLocaleDateString()})` : ''} is now past due. Please arrange payment at your earliest convenience.</p>`;
      const result = await this.email.send({
        to: invoice.booking.client.email,
        subject,
        html,
      });

      await this.prisma.emailLog.create({
        data: {
          ownerId: invoice.booking.ownerId,
          bookingId: invoice.bookingId,
          type: 'invoice_overdue',
          recipientEmail: invoice.booking.client.email,
          subject,
          body: html,
          status: result.delivered ? 'sent' : 'skipped_not_configured',
        },
      });
      count++;
    }
    return count;
  }

  /**
   * Alerts the studio owner (not a client) when gear is due for service.
   * Dedup is scoped to `updatedAt` rather than "ever": once alerted for the
   * current `nextServiceDue`, it won't nag again unless the owner touches
   * the record (e.g. servicing it and pushing the date out resets the cycle).
   */
  private async checkEquipmentServiceDue(): Promise<number> {
    const ownerId = await this.ownerContext.getOwnerId();
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) return 0;

    const windowEnd = new Date(Date.now() + SERVICE_DUE_WARNING_DAYS * 24 * 60 * 60 * 1000);
    const dueItems = await this.prisma.equipment.findMany({
      where: { ownerId, nextServiceDue: { lte: windowEnd } },
    });

    let count = 0;
    for (const item of dueItems) {
      const alreadyAlerted = await this.prisma.emailLog.findFirst({
        where: {
          equipmentId: item.id,
          type: 'equipment_service_due',
          createdAt: { gte: item.updatedAt },
        },
      });
      if (alreadyAlerted) continue;

      const overdue = item.nextServiceDue! < new Date();
      const subject = `${overdue ? 'Overdue' : 'Upcoming'} service: ${item.name}`;
      const html = `<p>${item.name}${item.serialNumber ? ` (S/N ${item.serialNumber})` : ''} is ${
        overdue
          ? 'overdue for service'
          : `due for service on ${item.nextServiceDue!.toLocaleDateString()}`
      }.</p>`;
      const result = await this.email.send({ to: owner.email, subject, html });

      await this.prisma.emailLog.create({
        data: {
          ownerId,
          equipmentId: item.id,
          type: 'equipment_service_due',
          recipientEmail: owner.email,
          subject,
          body: html,
          status: result.delivered ? 'sent' : 'skipped_not_configured',
        },
      });
      count++;
    }
    return count;
  }

  async listLogs() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.emailLog.findMany({
      where: { ownerId },
      include: { booking: { include: { client: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
