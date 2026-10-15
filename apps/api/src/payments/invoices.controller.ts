import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { createInvoiceSchema, markInvoicePaidSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../auth/public.decorator.js';
import { InvoicesService } from './invoices.service.js';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../rate-limit/rate-limit.module.js';

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

  @Get('invoices/open')
  listOpenForOwner() {
    return this.invoicesService.listOpenForOwner();
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

  @Public()
  @Get('invoices/:id')
  getPublicView(@Param('id') id: string) {
    return this.invoicesService.getPublicView(id);
  }

  @Public()
  @Throttle({ default: RATE_LIMITS.publicSubmit })
  @Post('invoices/:id/checkout')
  createCheckoutSession(@Param('id') id: string) {
    return this.invoicesService.createCheckoutSession(id);
  }
}
