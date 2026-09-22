import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { OwnerContextService } from '../owner/owner-context.service.js';
import { QuestionnairesService } from './questionnaires.service.js';

function setup(claimCount: number) {
  const prisma = {
    questionnaireResponse: {
      findUnique: vi.fn(async () => ({ id: 'qr_1', submittedAt: null })),
      updateMany: vi.fn(async () => ({ count: claimCount })),
      findUniqueOrThrow: vi.fn(async () => ({ id: 'qr_1', submittedAt: new Date() })),
    },
  };
  const service = new QuestionnairesService(
    prisma as unknown as PrismaClient,
    {} as OwnerContextService,
  );
  return { prisma, service };
}

describe('QuestionnairesService.submit — double submission', () => {
  it('submits when it wins the claim', async () => {
    const { prisma, service } = setup(1);
    await service.submit('qr_1', { answers: { colour: 'blue' } });
    expect(prisma.questionnaireResponse.updateMany).toHaveBeenCalledOnce();
  });

  it('rejects a second simultaneous submit rather than overwriting the answers', async () => {
    const { service } = setup(0);
    await expect(service.submit('qr_1', { answers: { colour: 'red' } })).rejects.toThrow(
      ConflictException,
    );
  });
});
