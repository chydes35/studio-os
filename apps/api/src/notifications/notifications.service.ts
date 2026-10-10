import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../db/db.module.js';
import { addDays, zonedDateStr } from '../availability/zoned-time.js';
import { formatDateOnly, formatDateTime, html, plainSubject } from './email-html.js';
import { EmailService } from './email.service.js';

const REMINDER_DAYS_BEFORE = 3;
const OVERDUE_RESEND_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SERVICE_DUE_WARNING_DAYS = 14;

/**
 * Deliberately a plain singleton with no OwnerContextService dependency:
 * injecting that request-scoped service made this (and therefore
 * the scheduled worker) request-scoped too, and @nestjs/schedule silently
 * refuses to register @Cron on non-static providers — the daily job never ran.
 * Owner scoping is passed in explicitly instead: the cron runs across every
 * studio, the manual run-now endpoint passes the caller's own ownerId.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly email: EmailService,
  ) {}

  /** `ownerId` limits the run to one studio; omitted (the cron) means every studio. */
  async runDailyChecks(ownerId?: string): Promise<{
    remindersSent: number;
    overdueProcessed: number;
    equipmentAlertsSent: number;
  }> {
    const remindersSent = await this.checkShootReminders(ownerId);
    const overdueProcessed = await this.checkOverdueInvoices(ownerId);
    const equipmentAlertsSent = await this.checkEquipmentServiceDue(ownerId);
    this.logger.log(
      `Daily checks complete: ${remindersSent} shoot reminder(s), ${overdueProcessed} overdue invoice(s), ${equipmentAlertsSent} equipment alert(s)`,
    );
    return { remindersSent, overdueProcessed, equipmentAlertsSent };
  }

  private async checkShootReminders(ownerId?: string): Promise<number> {
    const now = new Date();
    // Fetch a broad absolute window, then select the local calendar date in
    // each owner's zone. A server-local midnight window misses some studios.
    const dayMs = 24 * 60 * 60 * 1000;
    const windowStart = new Date(now.getTime() + (REMINDER_DAYS_BEFORE - 1) * dayMs);
    const windowEnd = new Date(now.getTime() + (REMINDER_DAYS_BEFORE + 1) * dayMs);

    const bookings = await this.prisma.booking.findMany({
      where: {
        ownerId,
        scheduledAt: { gte: windowStart, lt: windowEnd },
        // Only confirmed shoots. An INQUIRY is a request the owner hasn't
        // accepted yet; telling that client "your shoot is in 3 days" would
        // promise a booking that may never happen.
        stage: 'BOOKED',
      },
      include: { client: true, owner: true },
    });

    let count = 0;
    for (const booking of bookings) {
      const reminderDate = addDays(zonedDateStr(now, booking.owner.timezone), REMINDER_DAYS_BEFORE);
      if (!booking.scheduledAt || zonedDateStr(booking.scheduledAt, booking.owner.timezone) !== reminderDate) continue;
      const alreadySent = await this.prisma.emailLog.findFirst({
        where: { bookingId: booking.id, type: 'shoot_reminder' },
      });
      if (alreadySent) continue;

      const subject = plainSubject(
        `Reminder: your ${booking.shootType} shoot is in ${REMINDER_DAYS_BEFORE} days`,
      );
      const body = html`<p>Hi ${booking.client.name},</p><p>Just a reminder that your ${booking.shootType} session is scheduled for ${booking.scheduledAt ? formatDateTime(booking.scheduledAt, booking.owner.timezone) : 'the scheduled time'}. Looking forward to it!</p>`;
      const result = await this.email.send({ to: booking.client.email, subject, html: body });

      await this.prisma.emailLog.create({
        data: {
          ownerId: booking.ownerId,
          bookingId: booking.id,
          type: 'shoot_reminder',
          recipientEmail: booking.client.email,
          subject,
          body,
          status: result.delivered ? 'sent' : 'skipped_not_configured',
        },
      });
      count++;
    }
    return count;
  }

  private async checkOverdueInvoices(ownerId?: string): Promise<number> {
    const now = new Date();
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        // OVERDUE belongs here too: once the first run flipped the status,
        // the invoice fell out of this query and the 24h resend below could
        // never fire, so every overdue invoice got exactly one reminder ever.
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        dueAt: { lt: now },
        booking: { ownerId },
      },
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
          // Per invoice, not per booking: a booking with two overdue
          // invoices used to send a reminder for only one of them.
          invoiceId: invoice.id,
          type: 'invoice_overdue',
          createdAt: { gte: new Date(now.getTime() - OVERDUE_RESEND_INTERVAL_MS) },
        },
      });
      if (recentReminder) continue;

      const subject = 'Invoice past due';
      const body = html`<p>Hi ${invoice.booking.client.name},</p><p>This is a reminder that your invoice${invoice.dueAt ? ` (due ${formatDateOnly(invoice.dueAt)})` : ''} is now past due. Please arrange payment at your earliest convenience.</p>`;
      const result = await this.email.send({
        to: invoice.booking.client.email,
        subject,
        html: body,
      });

      await this.prisma.emailLog.create({
        data: {
          ownerId: invoice.booking.ownerId,
          bookingId: invoice.bookingId,
          invoiceId: invoice.id,
          type: 'invoice_overdue',
          recipientEmail: invoice.booking.client.email,
          subject,
          body,
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
  private async checkEquipmentServiceDue(ownerId?: string): Promise<number> {
    const windowEnd = new Date(Date.now() + SERVICE_DUE_WARNING_DAYS * 24 * 60 * 60 * 1000);
    const dueItems = await this.prisma.equipment.findMany({
      where: { ownerId, nextServiceDue: { lte: windowEnd } },
      include: { owner: true },
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
      const subject = plainSubject(`${overdue ? 'Overdue' : 'Upcoming'} service: ${item.name}`);
      const body = html`<p>${item.name}${item.serialNumber ? ` (S/N ${item.serialNumber})` : ''} is ${
        overdue
          ? 'overdue for service'
          : `due for service on ${formatDateOnly(item.nextServiceDue!)}`
      }.</p>`;
      const result = await this.email.send({ to: item.owner.email, subject, html: body });

      await this.prisma.emailLog.create({
        data: {
          ownerId: item.ownerId,
          equipmentId: item.id,
          type: 'equipment_service_due',
          recipientEmail: item.owner.email,
          subject,
          body,
          status: result.delivered ? 'sent' : 'skipped_not_configured',
        },
      });
      count++;
    }
    return count;
  }

  async listLogs(ownerId: string) {
    return this.prisma.emailLog.findMany({
      where: { ownerId },
      include: { booking: { include: { client: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
