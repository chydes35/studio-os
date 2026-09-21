import { Global, type INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module.js';
import { PRISMA } from '../db/db.module.js';
import { RATE_LIMITS, RateLimitModule } from './rate-limit.module.js';

// No user ever exists, so every login is a 401 until the limiter kicks in.
@Global()
@Module({
  providers: [{ provide: PRISMA, useValue: { user: { findUnique: async () => null } } }],
  exports: [PRISMA],
})
class FakeDbModule {}

describe('Rate limiting', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        FakeDbModule,
        RateLimitModule,
        AuthModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('blocks login guessing after the per-IP limit, even for failed attempts', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'owner@studio-os.dev', password: 'wrong-password' });

    for (let i = 0; i < RATE_LIMITS.login.limit; i++) {
      expect((await attempt()).status).toBe(401);
    }
    expect((await attempt()).status).toBe(429);
  });

  it('uses the default (generous) limit on routes without an override', async () => {
    // GET /auth/me has no @Throttle: 20 calls are all plain 401s, never 429.
    for (let i = 0; i < 20; i++) {
      expect((await request(app.getHttpServer()).get('/auth/me')).status).toBe(401);
    }
  });
});
