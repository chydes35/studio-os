import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { createInvoiceSchema, markInvoicePaidSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { InvoicesService } from './invoices.service.js';

@Controller()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('bookings/:bookingId/invoices')
  createForBooking(
    @Param('bookingId') bookingId: string,
    @Body(new ZodValidationPipe(createInvoiceSchema))
    body: ReturnType<typeof createInvoiceSchema.parse>,
  ) {
    return this.invoicesService.createForBooking(bookingId, body);
  }

  @Get('bookings/:bookingId/invoices')
  listForBooking(@Param('bookingId') bookingId: string) {
    return this.invoicesService.listForBookingOwnerView(bookingId);
  }

  @Patch('invoices/:id/send')
  markSent(@Param('id') id: string) {
    return this.invoicesService.markSent(id);
  }

  @Post('invoices/:id/mark-paid')
  markPaid(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markInvoicePaidSchema))
    body: ReturnType<typeof markInvoicePaidSchema.parse>,
  ) {
    return this.invoicesService.markPaid(id, body.amountCents);
  }

  @Get('invoices/:id')
  getPublicView(@Param('id') id: string) {
    return this.invoicesService.getPublicView(id);
  }

  @Post('invoices/:id/checkout')
  createCheckoutSession(@Param('id') id: string) {
    return this.invoicesService.createCheckoutSession(id);
  }
}
