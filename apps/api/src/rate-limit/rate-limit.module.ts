import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Per-IP limits, applied with `@Throttle({ default: RATE_LIMITS.x })`.
 * Everything else gets DEFAULT_LIMIT, which is generous enough that the
 * owner dashboard never notices it. The tight ones guard the unauthenticated
 * endpoints where guessing or spam is the risk: login/register, gallery
 * passwords, and the public booking form.
 *
 * Counters are in-memory, so like the daily cron this assumes a single API
 * instance; a shared store (e.g. Redis) is needed before scaling out. Behind
 * a reverse proxy, set TRUST_PROXY (see main.ts) or every visitor shares the
 * proxy's IP and one bucket.
 */
export const RATE_LIMITS = {
  login: { limit: 10, ttl: MINUTE },
  forgotPassword: { limit: 5, ttl: HOUR },
  resetPassword: { limit: 10, ttl: HOUR },
  register: { limit: 5, ttl: HOUR },
  galleryPassword: { limit: 10, ttl: MINUTE },
  galleryAction: { limit: 60, ttl: MINUTE },
  publicBookingRequest: { limit: 10, ttl: HOUR },
  publicSlots: { limit: 60, ttl: MINUTE },
  publicSubmit: { limit: 10, ttl: MINUTE },
} as const;

export const DEFAULT_LIMIT = { limit: 300, ttl: MINUTE };

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ...DEFAULT_LIMIT }])],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
