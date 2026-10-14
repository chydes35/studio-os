import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@repo/db';
import type { EmailService } from '../notifications/email.service.js';
import { AuthService } from './auth.service.js';

const USER = { id: 'user_1', name: 'Ann', email: 'ann@example.com' };
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

function setup(
  options: {
    user?: typeof USER | null;
    token?: Record<string, unknown> | null;
  } = {},
) {
  const prisma = {
    user: {
      findUnique: vi.fn(async () =>
        options.user === undefined ? USER : options.user,
      ),
      update: vi.fn(
        async (_args: {
          data: { passwordHash: string; sessionsValidFrom: Date };
        }) => USER,
      ),
    },
    passwordResetToken: {
      create: vi.fn(async (args: { data: { tokenHash: string } }) => ({
        id: 'tok_1',
        ...args.data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => options.token ?? null),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (ops: unknown) =>
    typeof ops === 'function' ? ops(prisma) : ops,
  );
  const email = {
    send: vi.fn(
      async (_args: { to: string; subject: string; html: string }) => ({
        delivered: true,
      }),
    ),
  };
  const service = new AuthService(
    prisma as unknown as PrismaClient,
    {} as JwtService,
    { get: () => 'https://studio.example.com' } as unknown as ConfigService,
    email as unknown as EmailService,
  );
  return { prisma, email, service };
}

describe('AuthService.requestPasswordReset', () => {
  it('emails a link and stores only the hash of the token', async () => {
    const { prisma, email, service } = setup();

    await expect(
      service.requestPasswordReset({ email: 'ann@example.com' }),
    ).resolves.toEqual({
      ok: true,
    });

    const sentHtml = email.send.mock.calls[0]![0].html;
    const token = /token=([A-Za-z0-9_-]+)/.exec(sentHtml)?.[1];
    expect(token).toBeTruthy();

    const stored = prisma.passwordResetToken.create.mock.calls[0]![0].data;
    expect(stored.tokenHash).toBe(sha256(token!));
    expect(stored.tokenHash).not.toBe(token);
    expect(sentHtml).toContain(
      'https://studio.example.com/reset-password?token=',
    );
  });

  // Answering differently for a registered address would turn this endpoint
  // into a way to test which emails have accounts.
  it('answers the same for an unknown address, and creates nothing', async () => {
    const { prisma, email, service } = setup({ user: null });

    await expect(
      service.requestPasswordReset({ email: 'nobody@example.com' }),
    ).resolves.toEqual({
      ok: true,
    });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('never logs a raw reset link when delivery fails', async () => {
    const { email, service } = setup();
    email.send.mockResolvedValueOnce({ delivered: false });
    const warn = vi
      .spyOn(
        (service as unknown as { logger: { warn: (message: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    await service.requestPasswordReset({ email: 'ann@example.com' });
    const token = /token=([A-Za-z0-9_-]+)/.exec(
      email.send.mock.calls[0]![0].html,
    )?.[1];
    expect(token).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(' ')).not.toContain(token);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('/reset-password?');
    warn.mockRestore();
  });

  it('retires any outstanding link when a new one is issued', async () => {
    const { prisma, service } = setup();
    await service.requestPasswordReset({ email: 'ann@example.com' });

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });
});

describe('AuthService.resetPassword', () => {
  const validToken = {
    id: 'tok_1',
    userId: 'user_1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  it('sets the new password and stamps sessionsValidFrom', async () => {
    const { prisma, service } = setup({ token: validToken });

    await expect(
      service.resetPassword({ token: 'raw', password: 'newpassword1' }),
    ).resolves.toEqual({ ok: true });

    const update = prisma.user.update.mock.calls[0]![0];
    expect(bcrypt.compareSync('newpassword1', update.data.passwordHash)).toBe(
      true,
    );
    expect(update.data.sessionsValidFrom).toBeInstanceOf(Date);
  });

  it.each([
    ['an unknown token', null],
    ['an already-used token', { ...validToken, usedAt: new Date() }],
    [
      'an expired token',
      { ...validToken, expiresAt: new Date(Date.now() - 1000) },
    ],
  ])('refuses %s', async (_label, token) => {
    const { prisma, service } = setup({
      token: token as Record<string, unknown> | null,
    });

    await expect(
      service.resetPassword({ token: 'raw', password: 'newpassword1' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to change a password when another request already claimed the token', async () => {
    const { prisma, service } = setup({ token: validToken });
    prisma.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.resetPassword({ token: 'raw', password: 'newpassword1' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('looks the token up by hash, never by its raw value', async () => {
    const { prisma, service } = setup({ token: validToken });
    await service.resetPassword({
      token: 'raw-token-value',
      password: 'newpassword1',
    });

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256('raw-token-value') },
    });
  });
});
