import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Public } from '../auth/public.decorator.js';
import { InvoicesService } from './invoices.service.js';
import { StripeService } from './stripe.service.js';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('stripe')
export class StripeWebhookController {
  constructor(
    private readonly stripe: StripeService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /**
   * Registered but unreachable end-to-end without a real Stripe account: no
   * STRIPE_WEBHOOK_SECRET exists yet, so constructWebhookEvent always throws
   * "Stripe webhook is not configured" (see StripeService). Wire this up for
   * real once Stripe credentials exist — the event-handling logic below is
   * complete, just untestable until then. Public: Stripe calls this with no
   * bearer token, its own signature (verified above) is the security boundary.
   */
  @Public()
  // Stripe retries in bursts and signs every call; never throttle it.
  @SkipThrottle()
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    const event = this.stripe.constructWebhookEvent(req.rawBody, signature);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId && session.amount_total) {
        await this.invoicesService.handleCheckoutCompleted(
          invoiceId,
          session.amount_total,
          typeof session.payment_intent === 'string' ? session.payment_intent : '',
        );
      }
    }

    return { received: true };
  }
}
