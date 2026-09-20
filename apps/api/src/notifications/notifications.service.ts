import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { EmailService } from './email.service.js';

const REMINDER_DAYS_BEFORE = 3;
const OVERDUE_RESEND_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

  async runDailyChecks(): Promise<{ remindersSent: number; overdueProcessed: number }> {
    const remindersSent = await this.checkShootReminders();
    const overdueProcessed = await this.checkOverdueInvoices();
    this.logger.log(
      `Daily checks complete: ${remindersSent} shoot reminder(s), ${overdueProcessed} overdue invoice(s) processed`,
    );
    return { remindersSent, overdueProcessed };
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

  async listLogs() {
    const ownerId = await this.ownerContext.getOwnerId();
    return this.prisma.emailLog.findMany({
      where: { ownerId },
      include: { booking: { include: { client: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
