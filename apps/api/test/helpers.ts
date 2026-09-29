import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  // Same options main.ts uses where they affect behaviour under test.
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  // Rate limits key on req.ip. Trusting X-Forwarded-For lets every actor in a
  // test come from its own address, so one test's registrations can't trip
  // another's limit.
  app.set('trust proxy', true);
  await app.init();
  return app;
}

let nextIp = 10;
const freshIp = () => `10.20.${Math.floor(nextIp / 250)}.${(nextIp++ % 250) + 1}`;

/** A signed-in studio owner talking to the API from their own IP. */
export class Actor {
  ip = freshIp();
  token = '';
  id = '';
  password = 'correct horse battery';
  constructor(
    private readonly app: NestExpressApplication,
    public email: string,
  ) {}

  static async register(app: NestExpressApplication, label = 'owner'): Promise<Actor> {
    const actor = new Actor(app, `${label}-${randomUUID()}@e2e.test`);
    const res = await actor.anon('post', '/auth/register').send({
      name: `E2E ${label}`,
      email: actor.email,
      password: actor.password,
      timezone: 'America/Chicago',
    });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${res.text}`);
    actor.token = res.body.accessToken;
    actor.id = res.body.user.id;
    return actor;
  }

  /** A request with no credentials, from this actor's IP. */
  anon(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
    return request(this.app.getHttpServer())[method](path).set('X-Forwarded-For', this.ip);
  }
  /** A request carrying this actor's token. */
  as(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
    return this.anon(method, path).set('Authorization', `Bearer ${this.token}`);
  }
  get(path: string) { return this.as('get', path); }
  post(path: string) { return this.as('post', path); }
  patch(path: string) { return this.as('patch', path); }
  del(path: string) { return this.as('delete', path); }
}

/** A real-sized JPEG, like a camera export. Tiny images hid a watermark bug once. */
export function bigJpeg(width = 3000, height = 2000): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 160, b: 90 } },
  })
    .jpeg()
    .toBuffer();
}

/** Smallest valid PNG, as a data URL, standing in for a drawn signature. */
export const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * True when the S3-compatible store (MinIO locally, whatever CI starts) is
 * reachable, creating the test bucket if it doesn't exist yet. Storage-backed
 * tests return early when this is false.
 */
export async function storageIsUp(): Promise<boolean> {
  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
    maxAttempts: 1,
    requestHandler: { requestTimeout: 3000, connectionTimeout: 2000 },
  });
  const Bucket = process.env.R2_BUCKET_NAME;
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 404) throw err;
      await client.send(new CreateBucketCommand({ Bucket }));
    }
    return true;
  } catch {
    return false;
  } finally {
    client.destroy();
  }
}
