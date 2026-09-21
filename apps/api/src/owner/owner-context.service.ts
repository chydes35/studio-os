import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Resolves "the current owner" from the authenticated request (populated by
 * JwtAuthGuard). Request-scoped because the owner now genuinely varies per
 * request — this replaced the Phase-1 stand-in that always resolved to a
 * single hardcoded seeded user. Only ever called from owner-only routes
 * (never from a @Public() capability/password-gated handler), so req.user
 * is guaranteed to be set by the time this runs.
 */
@Injectable({ scope: Scope.REQUEST })
export class OwnerContextService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  async getOwnerId(): Promise<string> {
    if (!this.request.user) {
      throw new UnauthorizedException('No authenticated user on this request');
    }
    return this.request.user.id;
  }
}
