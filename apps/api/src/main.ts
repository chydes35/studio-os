import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { getCorsOrigins } from './config/runtime-config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Behind a reverse proxy / load balancer, req.ip is the proxy's address
  // unless Express is told to trust X-Forwarded-For. Rate limiting keys on
  // req.ip, and contract signatures record it in their audit trail, so set
  // TRUST_PROXY to the number of proxy hops in front of the API (usually 1).
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  }
  const corsOrigins = getCorsOrigins(process.env);
  app.enableCors({
    origin(origin, callback) {
      // Native clients and command-line requests have no Origin header.
      if (!origin || corsOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'), false);
    },
  });
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
