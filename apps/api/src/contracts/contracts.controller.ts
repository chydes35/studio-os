import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createContractSchema, signContractSchema } from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ContractsService } from './contracts.service.js';

@Controller()
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post('bookings/:bookingId/contract')
  createForBooking(
    @Param('bookingId') bookingId: string,
    @Body(new ZodValidationPipe(createContractSchema))
    body: ReturnType<typeof createContractSchema.parse>,
  ) {
    return this.contractsService.createForBooking(bookingId, body);
  }

  @Get('bookings/:bookingId/contract')
  getForBooking(@Param('bookingId') bookingId: string) {
    return this.contractsService.getForBookingOwnerView(bookingId);
  }

  @Get('contracts/:id')
  getPublicView(@Param('id') id: string) {
    return this.contractsService.getPublicView(id);
  }

  @Post('contracts/:id/sign')
  sign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(signContractSchema))
    body: ReturnType<typeof signContractSchema.parse>,
    @Req() req: Request,
  ) {
    const signerIp = req.ip ?? 'unknown';
    const signerUserAgent = req.headers['user-agent'] ?? 'unknown';
    return this.contractsService.sign(id, body, signerIp, signerUserAgent);
  }

  @Get('contracts/:id/download')
  getDownloadUrl(@Param('id') id: string) {
    return this.contractsService.getDownloadUrl(id);
  }
}
