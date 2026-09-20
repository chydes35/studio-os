import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@repo/db';
import type { CreateContractDto, SignContractDto } from '@repo/shared';
import { PRISMA } from '../db/db.module.js';
import { OwnerContextService } from '../owner/owner-context.service.js';
import { StorageService } from '../storage/storage.service.js';
import { PdfService } from './pdf.service.js';
import { renderTemplate } from './render-template.js';

@Injectable()
export class ContractsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ownerContext: OwnerContextService,
    private readonly storage: StorageService,
    private readonly pdf: PdfService,
  ) {}

  async createForBooking(bookingId: string, dto: CreateContractDto) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const existing = await this.prisma.contract.findUnique({ where: { bookingId } });
    if (existing) throw new ConflictException('This booking already has a contract');

    const template = await this.prisma.contractTemplate.findFirst({
      where: { id: dto.templateId, ownerId },
    });
    if (!template) throw new NotFoundException('Contract template not found');

    const renderedMarkdown = renderTemplate(template.bodyMarkdown, dto.variables);

    return this.prisma.contract.create({
      data: { bookingId, templateId: template.id, renderedMarkdown },
    });
  }

  async getForBookingOwnerView(bookingId: string) {
    const ownerId = await this.ownerContext.getOwnerId();
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, ownerId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    return this.prisma.contract.findUnique({
      where: { bookingId },
      include: { template: true },
    });
  }

  async getPublicView(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { template: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return {
      id: contract.id,
      templateName: contract.template.name,
      renderedMarkdown: contract.renderedMarkdown,
      signedAt: contract.signedAt,
      signerName: contract.signerName,
    };
  }

  async sign(
    contractId: string,
    dto: SignContractDto,
    signerIp: string,
    signerUserAgent: string,
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { template: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.signedAt) {
      throw new ConflictException('This contract has already been signed');
    }

    const signedAt = new Date();
    const pdfBuffer = await this.pdf.generateContractPdf({
      title: contract.template.name,
      bodyText: contract.renderedMarkdown,
      signerName: dto.signerName,
      signedAt,
      signatureImageDataUrl: dto.signatureImage,
      signerIp,
      signerUserAgent,
    });
    const documentHash = createHash('sha256').update(pdfBuffer).digest('hex');
    const pdfKey = this.storage.contractKey(contract.id);
    await this.storage.putObjectBuffer(pdfKey, pdfBuffer, 'application/pdf');

    return this.prisma.contract.update({
      where: { id: contractId },
      data: {
        signedAt,
        signerName: dto.signerName,
        signatureImage: dto.signatureImage,
        signerIp,
        signerUserAgent,
        documentHash,
        pdfR2Key: pdfKey,
      },
    });
  }

  async getDownloadUrl(contractId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract?.pdfR2Key) throw new NotFoundException('Signed PDF not available yet');
    return { url: await this.storage.getPresignedGetUrl(contract.pdfR2Key) };
  }
}
