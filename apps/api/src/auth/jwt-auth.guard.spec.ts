import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaClient } from '@repo/db';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const SECONDS = (d: Date) => Math.floor(d.getTime() / 1000);

function contextWithToken(token?: string): ExecutionContext {
  const request = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function setup(options: { iat: number; passwordChangedAt: Date | null; isPublic?: boolean }) {
  const reflector = { getAllAndOverride: () => options.isPublic ?? false } as unknown as Reflector;
  const jwt = {
    verifyAsync: async () => ({ id: 'user_1', email: 'a@b.c', role: 'OWNER', iat: options.iat }),
  } as unknown as JwtService;
  const prisma = {
    user: {
      findUnique: vi.fn(async () =>
        options.passwordChangedAt ? { passwordChangedAt: options.passwordChangedAt } : null,
      ),
    },
  };
  return new JwtAuthGuard(reflector, jwt, prisma as unknown as PrismaClient);
}

describe('JwtAuthGuard password-change check', () => {
  const now = new Date('2026-09-22T12:00:00Z');

  it('accepts a token issued after the last password change', async () => {
    const guard = setup({ iat: SECONDS(now) + 60, passwordChangedAt: now });
    await expect(guard.canActivate(contextWithToken('t'))).resolves.toBe(true);
  });

  // The point of the whole feature: a reset ends sessions someone else holds.
  it('rejects a token issued before the password changed', async () => {
    const guard = setup({ iat: SECONDS(now) - 60, passwordChangedAt: now });
    await expect(guard.canActivate(contextWithToken('t'))).rejects.toThrow(UnauthorizedException);
  });

  // Signing in immediately after a reset mints a token in the same whole
  // second as the change; that must not be treated as stale.
  it('accepts a token minted in the same second as the change', async () => {
    const guard = setup({ iat: SECONDS(now), passwordChangedAt: now });
    await expect(guard.canActivate(contextWithToken('t'))).resolves.toBe(true);
  });

  it('rejects a token whose account no longer exists', async () => {
    const guard = setup({ iat: SECONDS(now), passwordChangedAt: null });
    await expect(guard.canActivate(contextWithToken('t'))).rejects.toThrow(UnauthorizedException);
  });

  it('lets public routes through without any database lookup', async () => {
    const guard = setup({ iat: SECONDS(now), passwordChangedAt: now, isPublic: true });
    await expect(guard.canActivate(contextWithToken())).resolves.toBe(true);
  });
});
