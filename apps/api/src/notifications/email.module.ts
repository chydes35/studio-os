import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';

/**
 * Just the mail sender, separate from NotificationsModule so that anything
 * needing to send one email (password reset) doesn't pull in the daily
 * scheduler and the owner-scoped notifications controller with it.
 */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
