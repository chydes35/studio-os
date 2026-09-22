import { ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@repo/db';
import type { OwnerContextService } from '../owner/owner-context.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { PdfService } from './pdf.service.js';
import { ContractsService } from './contracts.service.js';

const CONTRACT = {
  id: 'contract_1',
  signedAt: null as Date | null,
  renderedMarkdown: 'Terms',
  template: { name: 'Agreement' },
};

const signDto = { signerName: 'Ann Lee', signatureImage: 'data:image/png;base64,AAA' };

function setup(options: { claimCount?: number; pdfThrows?: boolean } = {}) {
  const prisma = {
    contract: {
      findUnique: vi.fn(async () => CONTRACT),
      updateMany: vi.fn(async (_args: { where: unknown; data: { signedAt: Date | null } }) => ({
        count: options.claimCount ?? 1,
      })),
      update: vi.fn(async () => ({ ...CONTRACT, signedAt: new Date() })),
    },
  };
  const pdf = {
    generateContractPdf: vi.fn(async () => {
      if (options.pdfThrows) throw new Error('pdf generation failed');
      return Buffer.from('%PDF-1.7');
    }),
  };
  const storage = {
    contractKey: (id: string) => `contracts/${id}.pdf`,
    putObjectBuffer: vi.fn(async () => undefined),
  };
  const service = new ContractsService(
    prisma as unknown as PrismaClient,
    {} as OwnerContextService,
    storage as unknown as StorageService,
    pdf as unknown as PdfService,
  );
  return { prisma, pdf, storage, service };
}

describe('ContractsService.sign — double submission', () => {
  it('signs when it wins the claim', async () => {
    const { prisma, storage, service } = setup();
    await service.sign('contract_1', signDto, '203.0.113.1', 'agent');

    expect(prisma.contract.updateMany).toHaveBeenCalledOnce();
    expect(storage.putObjectBuffer).toHaveBeenCalledOnce();
    expect(prisma.contract.update).toHaveBeenCalledOnce();
  });

  // Regression: "read signedAt, then update" let two simultaneous submits
  // both pass the check, and the second overwrote the first signer's name,
  // IP and PDF on a legally meaningful document.
  it('rejects the loser of a simultaneous submit without touching the PDF', async () => {
    const { pdf, storage, service } = setup({ claimCount: 0 });

    await expect(service.sign('contract_1', signDto, '203.0.113.2', 'agent')).rejects.toThrow(
      ConflictException,
    );
    expect(pdf.generateContractPdf).not.toHaveBeenCalled();
    expect(storage.putObjectBuffer).not.toHaveBeenCalled();
  });

  it('releases the claim if generating the PDF fails, so it stays signable', async () => {
    const { prisma, service } = setup({ pdfThrows: true });

    await expect(service.sign('contract_1', signDto, '203.0.113.3', 'agent')).rejects.toThrow(
      'pdf generation failed',
    );
    // Second updateMany is the rollback, setting signedAt back to null.
    expect(prisma.contract.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.contract.updateMany.mock.calls[1]![0]).toMatchObject({
      data: { signedAt: null },
    });
  });
});
