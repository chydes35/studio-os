import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import { PRISMA } from '../db/db.module.js';

/**
 * There is no auth yet (Phase 1 scope). Every business-owned record needs an
 * ownerId, so this resolves to the single seeded owner until real auth lands
 * and this gets replaced by a request-scoped lookup from the session/JWT.
 */
@Injectable()
export class OwnerContextService {
  private ownerId: string | null = null;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async getOwnerId(): Promise<string> {
    if (this.ownerId) return this.ownerId;
    const owner = await this.prisma.user.findFirstOrThrow({
      where: { role: 'OWNER' },
    });
    this.ownerId = owner.id;
    return this.ownerId;
  }
}
