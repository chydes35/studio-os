import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { OwnerContextService } from '../owner/owner-context.service.js';
import { QuestionnaireTemplatesService } from '../questionnaires/questionnaire-templates.service.js';
import { ContractTemplatesService } from './contract-templates.service.js';

const ownerContext = { getOwnerId: async () => 'owner_1' } as unknown as OwnerContextService;
const TEMPLATE = { id: 'tpl_1', ownerId: 'owner_1' };

function prismaWith(usage: number) {
  const remove = vi.fn(async () => TEMPLATE);
  const count = vi.fn(async () => usage);
  const template = { findFirst: vi.fn(async () => TEMPLATE), delete: remove };
  const prisma = {
    contractTemplate: template,
    questionnaireTemplate: template,
    contract: { count },
    questionnaireResponse: { count },
  };
  return { prisma: prisma as unknown as PrismaClient, remove };
}

describe('deleting a template that is in use', () => {
  it.each([
    ['contract', (p: PrismaClient) => new ContractTemplatesService(p, ownerContext)],
    ['questionnaire', (p: PrismaClient) => new QuestionnaireTemplatesService(p, ownerContext)],
  ])('%s template: refuses with 409 instead of hitting the foreign key', async (_kind, make) => {
    const { prisma, remove } = prismaWith(2);
    await expect(make(prisma).delete('tpl_1')).rejects.toBeInstanceOf(ConflictException);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ['contract', (p: PrismaClient) => new ContractTemplatesService(p, ownerContext)],
    ['questionnaire', (p: PrismaClient) => new QuestionnaireTemplatesService(p, ownerContext)],
  ])('%s template: deletes an unused one', async (_kind, make) => {
    const { prisma, remove } = prismaWith(0);
    await expect(make(prisma).delete('tpl_1')).resolves.toEqual({ id: 'tpl_1' });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
