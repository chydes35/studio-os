import { Global, Module } from '@nestjs/common';
import { OwnerContextService } from './owner-context.service.js';

@Global()
@Module({
  providers: [OwnerContextService],
  exports: [OwnerContextService],
})
export class OwnerModule {}
