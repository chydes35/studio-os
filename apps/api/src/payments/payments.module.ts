import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller.js';
import { ExpensesService } from './expenses.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicesService } from './invoices.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeService } from './stripe.service.js';

@Module({
  controllers: [InvoicesController, ExpensesController, StripeWebhookController],
  providers: [InvoicesService, ExpensesService, StripeService],
})
export class PaymentsModule {}
