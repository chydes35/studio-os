import { RequestMethod } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { IS_PUBLIC_KEY } from '../src/auth/public.decorator.js';
import { createTestApp } from './helpers.js';

type Route = { method: string; path: string; isPublic: boolean };

const join = (...parts: string[]) =>
  '/' + parts.map((p) => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/');

function discoverRoutes(app: NestExpressApplication): Route[] {
  const routes: Route[] = [];
  for (const wrapper of app.get(DiscoveryService).getControllers()) {
    const cls = wrapper.metatype as (new (...a: never[]) => unknown) | null;
    if (!cls) continue;
    const prefix: string = Reflect.getMetadata('path', cls) ?? '';
    for (const name of Object.getOwnPropertyNames(cls.prototype)) {
      const handler = (cls.prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const verb: number | undefined = Reflect.getMetadata('method', handler);
      if (verb === undefined) continue;
      const path: string = Reflect.getMetadata('path', handler) ?? '';
      routes.push({
        method: RequestMethod[verb].toLowerCase(),
        path: join(prefix, path),
        isPublic:
          Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
          Reflect.getMetadata(IS_PUBLIC_KEY, cls) === true,
      });
    }
  }
  return routes;
}

/**
 * Every route that is reachable without logging in, spelled out.
 * Adding to this list is a security decision: each entry must be protected by
 * its own capability URL, password, or signature. If this test fails because
 * you added a @Public() route, confirm that, then add it here.
 */
const EXPECTED_PUBLIC = [
  'GET /',
  'GET /availability/slots/:ownerId',
  'GET /contracts/:id',
  'GET /contracts/:id/download',
  'GET /health/live',
  'GET /health/ready',
  'GET /invoices/:id',
  'GET /questionnaire-responses/:id',
  'POST /auth/forgot-password',
  'POST /auth/login',
  'POST /auth/register',
  'POST /auth/reset-password',
  'POST /bookings/public-request/:ownerId',
  'POST /contracts/:id/sign',
  'POST /gallery/:galleryId/view',
  'POST /invoices/:id/checkout',
  'POST /media/:id/comments',
  'POST /media/:id/favorite',
  'POST /media/:mediaId/download',
  'POST /questionnaire-responses/:id/submit',
  'POST /stripe/webhook',
];

describe('route authorization', () => {
  let app: NestExpressApplication;
  let routes: Route[];

  beforeAll(async () => {
    app = await createTestApp();
    routes = discoverRoutes(app);
  });
  afterAll(() => app.close());

  it('discovers a plausible number of routes (guards against the sweep silently testing nothing)', () => {
    expect(routes.length).toBeGreaterThan(70);
  });

  it('exposes exactly the reviewed set of public routes', () => {
    const actual = routes
      .filter((r) => r.isPublic)
      .map((r) => `${r.method.toUpperCase()} ${r.path}`)
      .sort();
    expect(actual).toEqual([...EXPECTED_PUBLIC].sort());
  });

  it('answers 401 to every non-public route when no token is sent', async () => {
    const failures: string[] = [];
    let ipCounter = 1;
    for (const route of routes.filter((r) => !r.isPublic)) {
      const url = route.path.replace(/:[A-Za-z]+/g, 'nonexistent');
      const res = await (request(app.getHttpServer()) as unknown as Record<string, (u: string) => request.Test>)
        [route.method](url)
        .set('X-Forwarded-For', `10.99.0.${ipCounter++ % 250}`);
      if (res.status !== 401) failures.push(`${route.method.toUpperCase()} ${route.path} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('rejects a forged token', async () => {
    const res = await request(app.getHttpServer())
      .get('/clients')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('reports liveness and database readiness without a token', async () => {
    const live = await request(app.getHttpServer()).get('/health/live');
    const ready = await request(app.getHttpServer()).get('/health/ready');
    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(live.body).toEqual({ status: 'ok' });
    expect(ready.body).toEqual({ status: 'ok' });
  });
});
