import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../db/db.module.js';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'OWNER' | 'STAFF';
  /** Issued-at, in seconds; set by the signer, used for the reset check. */
  iat?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Registered globally (APP_GUARD in AuthModule) so every route is protected
 * by default — a route must opt out with @Public() rather than opt in with
 * a guard, which is what let an earlier phase's media-upload endpoints go
 * unauthorized by accident. Client-facing flows (galleries, contracts,
 * invoices, questionnaires, the public booking portal) are @Public() and
 * rely on their own capability-URL/password gate instead of a login.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: AuthenticatedUser;
    try {
      payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // A valid signature isn't enough: the account must still exist and the
    // password must not have changed since this token was issued. That is
    // what makes a password reset end sessions someone else may be holding.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: { passwordChangedAt: true },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
    // `iat` is whole seconds, so a token minted in the same second as the
    // change (logging straight back in) must still count as newer.
    if (payload.iat !== undefined && changedAtSeconds > payload.iat) {
      throw new UnauthorizedException('Password was changed; please sign in again');
    }

    request.user = payload;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length);
  }
}
