import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { EmailService } from '../notifications/email.service.js';
import { AuthService } from './auth.service.js';

const dto = { name: 'Switch test', email: 'new@example.test', password: 'correct horse battery' };

function serviceWith(registrationOpen: string | undefined) {
  const findUnique = vi.fn().mockResolvedValue({ id: 'existing' });
  const prisma = { user: { findUnique, create: vi.fn() } };
  const config = { get: (key: string) => (key === 'REGISTRATION_OPEN' ? registrationOpen : undefined) };
  const service = new AuthService(
    prisma as never,
    {} as JwtService,
    config as unknown as ConfigService,
    {} as EmailService,
  );
  return { service, findUnique, create: prisma.user.create };
}

describe('AuthService.register and REGISTRATION_OPEN', () => {
  it.each([undefined, '', 'true', 'yes'])('proceeds when REGISTRATION_OPEN is %j', async (value) => {
    const { service, findUnique } = serviceWith(value);
    // The stubbed lookup reports the address as taken, which proves the gate let it through.
    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it.each(['false', 'FALSE', ' 0 ', 'no', 'off'])('refuses before touching the database when it is %j', async (value) => {
    const { service, findUnique, create } = serviceWith(value);
    await expect(service.register(dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
