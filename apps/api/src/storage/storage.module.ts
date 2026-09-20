import { Global, Module } from '@nestjs/common';
import { MuxService } from './mux.service.js';
import { StorageService } from './storage.service.js';
import { WatermarkService } from './watermark.service.js';

@Global()
@Module({
  providers: [StorageService, MuxService, WatermarkService],
  exports: [StorageService, MuxService, WatermarkService],
})
export class StorageModule {}
