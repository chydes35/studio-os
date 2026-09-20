import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private client: Stripe | null = null;
  private webhookSecret: string | undefined;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (secretKey) {
      this.client = new Stripe(secretKey);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createCheckoutSession(params: {
    invoiceId: string;
    amountCents: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }> {
    if (!this.client) {
      throw new BadRequestException(
        'Online payment requires Stripe to be configured (STRIPE_SECRET_KEY). Ask the studio owner to add Stripe credentials, or pay by another method.',
      );
    }
    const session = await this.client.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: params.description },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: { invoiceId: params.invoiceId },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });
    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }
    return { url: session.url };
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    if (!this.client || !this.webhookSecret) {
      throw new BadRequestException('Stripe webhook is not configured');
    }
    return this.client.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}
