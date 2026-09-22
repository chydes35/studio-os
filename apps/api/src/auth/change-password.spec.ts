import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@repo/db';
import type { EmailService } from '../notifications/email.service.js';
import { AuthService } from './auth.service.js';

const CURRENT = 'originalpass1';
const USER = {
  id: 'user_1',
  name: 'Ann',
  email: 'ann@example.com',
  role: 'OWNER' as const,
  timezone: 'UTC',
  passwordHash: bcrypt.hashSync(CURRENT, 4),
  sessionsValidFrom: new Date('2026-09-01T00:00:00Z'),
};

function setup() {
  const prisma = {
    user: {
      findUnique: vi.fn(async () => USER),
      update: vi.fn(
        async (args: { data: { passwordHash?: string; sessionsValidFrom?: Date } }) => ({
          ...USER,
          ...args.data,
        }),
      ),
    },
    passwordResetToken: { updateMany: vi.fn(async () => ({ count: 0 })) },
  };
  const service = new AuthService(
    prisma as unknown as PrismaClient,
    { signAsync: async () => 'new.jwt.token' } as unknown as JwtService,
    { get: () => 'https://studio.example.com' } as unknown as ConfigService,
    {} as EmailService,
  );
  return { prisma, service };
}

describe('AuthService.changePassword', () => {
  it('requires the current password, so an unlocked browser is not enough', async () => {
    const { prisma, service } = setup();

    await expect(
      service.changePassword('user_1', { currentPassword: 'wrong', newPassword: 'newpassword1' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('stores the new password and ends other sessions', async () => {
    const { prisma, service } = setup();

    const result = await service.changePassword('user_1', {
      currentPassword: CURRENT,
      newPassword: 'newpassword1',
    });

    const { data } = prisma.user.update.mock.calls[0]![0];
    expect(bcrypt.compareSync('newpassword1', data.passwordHash!)).toBe(true);
    expect(data.sessionsValidFrom!.getTime()).toBeGreaterThan(USER.sessionsValidFrom.getTime());
    // A fresh token for this device, so changing your password doesn't sign
    // you out of the tab you're doing it in.
    expect(result.accessToken).toBe('new.jwt.token');
  });

  it('retires outstanding reset links, which could otherwise undo the change', async () => {
    const { prisma, service } = setup();
    await service.changePassword('user_1', {
      currentPassword: CURRENT,
      newPassword: 'newpassword1',
    });

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });
});

describe('AuthService.signOutEverywhere', () => {
  it('moves the cutoff forward, which invalidates every existing token', async () => {
    const { prisma, service } = setup();

    await expect(service.signOutEverywhere('user_1')).resolves.toEqual({ ok: true });

    const { data } = prisma.user.update.mock.calls[0]![0];
    expect(data.sessionsValidFrom!.getTime()).toBeGreaterThan(USER.sessionsValidFrom.getTime());
    expect(data.passwordHash).toBeUndefined(); // the password itself is untouched
  });
});
