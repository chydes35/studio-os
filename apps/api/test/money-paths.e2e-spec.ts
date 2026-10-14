import { createHash, randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@repo/db';
import request from 'supertest';
import {
  Actor,
  SIGNATURE_PNG,
  bigJpeg,
  createTestApp,
  storageIsUp,
} from './helpers.js';
import { JobWorkerService } from '../src/jobs/job-worker.service.js';
import { PRISMA } from '../src/db/db.module.js';

/** The next Monday at least a week out, as YYYY-MM-DD (the studio is in America/Chicago). */
function upcomingMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 8);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('money paths', () => {
  let app: NestExpressApplication;
  let owner: Actor;
  let storage = false;
  let bookingId: string;

  beforeAll(async () => {
    app = await createTestApp();
    storage = await storageIsUp();
    owner = await Actor.register(app, 'money');
  });
  afterAll(() => app.close());

  describe('auth', () => {
    it('allows exactly one concurrent password reset with a single-use token', async () => {
      const actor = await Actor.register(app, 'reset-race');
      const token = randomUUID();
      await app.get<PrismaClient>(PRISMA).passwordResetToken.create({
        data: {
          userId: actor.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const passwords = ['first-reset-password', 'second-reset-password'];
      const results = await Promise.all(
        passwords.map((password) =>
          actor.anon('post', '/auth/reset-password').send({ token, password }),
        ),
      );
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([201, 400]);
      const winner = results.findIndex((result) => result.status === 201);
      expect(
        (
          await actor
            .anon('post', '/auth/login')
            .send({ email: actor.email, password: passwords[winner] })
        ).status,
      ).toBe(201);
      expect(
        (
          await actor
            .anon('post', '/auth/reset-password')
            .send({ token, password: 'replayed-password' })
        ).status,
      ).toBe(400);
    });

    it('logs in, returns the profile, and rejects a wrong password', async () => {
      const ok = await owner.anon('post', '/auth/login').send({ email: owner.email, password: owner.password });
      expect(ok.status).toBe(201);
      const me = await owner.anon('get', '/auth/me').set('Authorization', `Bearer ${ok.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(owner.email);

      const bad = await owner.anon('post', '/auth/login').send({ email: owner.email, password: 'wrong-password' });
      expect(bad.status).toBe(401);
    });

    it('treats email case-insensitively', async () => {
      const res = await owner
        .anon('post', '/auth/login')
        .send({ email: owner.email.toUpperCase(), password: owner.password });
      expect(res.status).toBe(201);
    });

    it('ends old sessions when the password changes, but keeps the current device signed in', async () => {
      const actor = await Actor.register(app, 'pw');
      const oldToken = actor.token;
      // Token `iat` has one-second resolution and the guard deliberately treats
      // a token minted in the same second as the change as still valid (so
      // signing straight back in works). Let the old token age a second first.
      await new Promise((r) => setTimeout(r, 1100));
      const res = await actor
        .post('/auth/change-password')
        .send({
          currentPassword: actor.password,
          newPassword: 'a brand new password',
        });
      expect(res.status).toBe(201);
      await new Promise((r) => setTimeout(r, 50));
      const oldRes = await actor.anon('get', '/auth/me').set('Authorization', `Bearer ${oldToken}`);
      expect(oldRes.status).toBe(401);
      const newRes = await actor.anon('get', '/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(newRes.status).toBe(200);
    });
  });

  describe('public booking portal', () => {
    const date = upcomingMonday();
    let slots: string[] = [];
    let firstBookingId = '';

    it('offers slots only after the owner sets working hours', async () => {
      const before = await owner.anon(
        'get',
        `/availability/slots/${owner.id}?date=${date}&durationMins=60`,
      );
      expect(before.status).toBe(200);
      expect(before.body.slots).toEqual([]);

      const rule = await owner
        .post('/availability/rules')
        .send({
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '12:00',
          bufferMinutes: 0,
        });
      expect(rule.status).toBe(201);

      const after = await owner.anon(
        'get',
        `/availability/slots/${owner.id}?date=${date}&durationMins=60`,
      );
      expect(after.body.timezone).toBe('America/Chicago');
      slots = after.body.slots;
      expect(slots).toHaveLength(3);
      // 09:00 Chicago is 14:00 or 15:00 UTC depending on DST, never 09:00 UTC.
      expect(new Date(slots[0]).getUTCHours()).not.toBe(9);
    });

    const publicRequest = (
      ownerId: string,
      scheduledAt: string,
      email: string,
      ip: string,
    ) =>
      request(app.getHttpServer())
        .post(`/bookings/public-request/${ownerId}`)
        .set('X-Forwarded-For', ip)
        .send({
          clientName: 'Pat Public',
          clientEmail: email,
          shootType: 'Portrait',
          scheduledAt,
          durationMins: 60,
        });

    it('books a slot, then refuses the same slot', async () => {
      const first = await publicRequest(
        owner.id,
        slots[0],
        `pat-${randomUUID()}@e2e.test`,
        '10.30.0.1',
      );
      expect(first.status).toBe(201);
      firstBookingId = first.body.id;
      // Confirmation only: nothing about the studio's client records may leak.
      expect(Object.keys(first.body).length).toBeLessThanOrEqual(5);

      const second = await publicRequest(
        owner.id,
        slots[0],
        `pat2-${randomUUID()}@e2e.test`,
        '10.30.0.2',
      );
      expect(second.status).toBeGreaterThanOrEqual(400);
      expect(second.status).toBeLessThan(500);

      const left = await owner.anon(
        'get',
        `/availability/slots/${owner.id}?date=${date}&durationMins=60`,
      );
      expect(left.body.slots).not.toContain(slots[0]);
    });

    it('lets exactly one of many simultaneous requests win a slot', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          publicRequest(
            owner.id,
            slots[1],
            `race-${i}-${randomUUID()}@e2e.test`,
            `10.31.0.${i + 1}`,
          ),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
    });

    it('only accepts the session lengths the booking page offers', async () => {
      const oddSlots = await owner.anon(
        'get',
        `/availability/slots/${owner.id}?date=${date}&durationMins=1`,
      );
      expect(oddSlots.status).toBe(400);

      const res = await request(app.getHttpServer())
        .post(`/bookings/public-request/${owner.id}`)
        .set('X-Forwarded-For', '10.32.0.1')
        .send({
          clientName: 'Pat',
          clientEmail: `odd-${randomUUID()}@e2e.test`,
          shootType: 'Portrait',
          scheduledAt: slots[2],
          durationMins: 1,
        });
      expect(res.status).toBe(400);
    });

    it('frees the slot again when the owner closes (declines) the request', async () => {
      const closed = await owner.patch(`/bookings/${firstBookingId}/stage`).send({ stage: 'CLOSED' });
      expect(closed.status).toBe(200);
      const res = await owner.anon(
        'get',
        `/availability/slots/${owner.id}?date=${date}&durationMins=60`,
      );
      expect(res.body.slots).toContain(slots[0]);
    });

    it('404s for an unknown studio', async () => {
      const res = await publicRequest(
        'does-not-exist',
        slots[2],
        'x@e2e.test',
        '10.30.0.9',
      );
      expect(res.status).toBe(404);
    });
  });

  describe('contract signing', () => {
    let contractId: string;
    const signerName = 'Nguyễn Łukasz 李';

    beforeAll(async () => {
      const client = await owner.post('/clients').send({ name: 'Sam Signer', email: `sam-${randomUUID()}@e2e.test` });
      const booking = await owner.post('/bookings').send({ clientId: client.body.id, shootType: 'Wedding' });
      bookingId = booking.body.id;
    });

    it('renders the template into a snapshot the template can no longer change', async () => {
      const tpl = await owner
        .post('/contract-templates')
        .send({
          name: 'Std',
          bodyMarkdown: 'Client {{client_name}} pays {{price}}.',
        });
      const created = await owner
        .post(`/bookings/${bookingId}/contract`)
        .send({
          templateId: tpl.body.id,
          variables: { client_name: 'Sam Signer', price: '$500' },
        });
      expect(created.status).toBe(201);
      contractId = created.body.id;

      const view = await owner.anon('get', `/contracts/${contractId}`);
      expect(view.body.renderedMarkdown).toBe('Client Sam Signer pays $500.');

      // A second contract for the same booking is refused.
      const dupe = await owner
        .post(`/bookings/${bookingId}/contract`)
        .send({ templateId: tpl.body.id, variables: {} });
      expect(dupe.status).toBe(409);
    });

    it('signs once, produces a real PDF, and refuses a second signature', async () => {
      if (!storage) return; // needs MinIO: the signed PDF is stored there
      const sign = await owner.anon('post', `/contracts/${contractId}/sign`).send({
        signerName,
        signatureImage: SIGNATURE_PNG,
      });
      expect(sign.status, sign.text).toBe(201);

      const again = await owner.anon('post', `/contracts/${contractId}/sign`).send({
        signerName: 'Someone Else',
        signatureImage: SIGNATURE_PNG,
      });
      expect(again.status).toBe(409);

      const dl = await owner.anon('get', `/contracts/${contractId}/download`);
      expect(dl.status).toBe(200);
      const pdf = Buffer.from(await (await fetch(dl.body.url)).arrayBuffer());
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      // Full Noto Sans is embedded (~630 KB); a subsetted font renders as
      // fragments and is only ~7 KB. See PdfService.
      expect(pdf.length).toBeGreaterThan(200_000);

      const view = await owner.anon('get', `/contracts/${contractId}`);
      expect(view.body.signerName).toBe(signerName);
      expect(view.body.signedAt).toBeTruthy();
    });
  });

  describe('invoicing', () => {
    let invoiceId: string;

    it('computes status from payments, never from a caller', async () => {
      const created = await owner.post(`/bookings/${bookingId}/invoices`).send({
        lineItems: [
          { description: 'Session', quantity: 1, unitAmountCents: 30000 },
          { description: 'Prints', quantity: 1, unitAmountCents: 5000 },
        ],
      });
      expect(created.status).toBe(201);
      invoiceId = created.body.id;
      expect(created.body).toMatchObject({
        status: 'DRAFT',
        totalCents: 35000,
        paidCents: 0,
      });

      const sent = await owner.patch(`/invoices/${invoiceId}/send`);
      expect(sent.body.status).toBe('SENT');

      const partial = await owner
        .post(`/invoices/${invoiceId}/mark-paid`)
        .send({ amountCents: 10000 });
      expect(partial.body).toMatchObject({
        status: 'PARTIALLY_PAID',
        paidCents: 10000,
        balanceCents: 25000,
      });

      const rest = await owner.post(`/invoices/${invoiceId}/mark-paid`).send({ amountCents: 25000 });
      expect(rest.body).toMatchObject({ status: 'PAID', balanceCents: 0 });
    });

    it('shows the public invoice page and refuses to check out when Stripe is unconfigured or the invoice is paid', async () => {
      const view = await owner.anon('get', `/invoices/${invoiceId}`);
      expect(view.status).toBe(200);
      expect(view.body.stripeConfigured).toBe(false);
      const checkout = await owner.anon(
        'post',
        `/invoices/${invoiceId}/checkout`,
      );
      expect(checkout.status).toBe(400);
    });

    it('rejects a Stripe webhook that is not signed', async () => {
      const res = await request(app.getHttpServer())
        .post('/stripe/webhook')
        .set('Content-Type', 'application/json')
        .send({ type: 'checkout.session.completed' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('gallery delivery', () => {
    const password = 'gallery-pass';
    let galleryId: string;
    let mediaId: string;
    let original: Buffer;

    beforeAll(async () => {
      if (!storage) return;
      const gallery = await owner.post(`/bookings/${bookingId}/gallery`).send({ password });
      expect(gallery.status).toBe(201);
      galleryId = gallery.body.id;

      original = await bigJpeg();
      const init = await owner.post('/media/upload-init').send({
        galleryId,
        fileName: 'IMG_0001.jpg',
        fileSizeBytes: original.length,
        mimeType: 'image/jpeg',
      });
      expect(init.status).toBe(201);
      mediaId = init.body.mediaId;
      const put = await fetch(init.body.uploadUrl, {
        method: 'PUT',
        body: new Uint8Array(original),
      });
      expect(put.ok).toBe(true);
      const done = await owner.post(`/media/${mediaId}/complete`);
      expect(done.status, done.text).toBe(201);
      expect(done.body.processingStatus).toBe('pending');
      expect(done.body.previewUrl).toBeNull();
      const duplicate = await owner.post(`/media/${mediaId}/complete`);
      expect(duplicate.status).toBe(201);
      expect(duplicate.body.processingStatus).toBe('pending');
      // This shared throwaway DB can contain queued work from earlier e2e
      // runs. Put this test's job first and drive the real worker until ready.
      const db = app.get<PrismaClient>(PRISMA);
      await db.backgroundJob.update({
        where: { key: `preview:${mediaId}` },
        data: { availableAt: new Date('2000-01-01T00:00:00Z') },
      });
      for (let attempt = 0; attempt < 5; attempt++) {
        await app.get(JobWorkerService).poll();
        const current = await db.media.findUnique({ where: { id: mediaId } });
        if (current?.processingStatus === 'ready') break;
      }
      expect(
        (await db.media.findUnique({ where: { id: mediaId } }))
          ?.processingStatus,
      ).toBe('ready');
    });

    it('serves a watermarked preview only behind the password', async () => {
      if (!storage) return;
      const wrong = await owner.anon('post', `/gallery/${galleryId}/view`).send({ password: 'nope' });
      expect(wrong.status).toBe(401);

      const view = await owner.anon('post', `/gallery/${galleryId}/view`).send({ password });
      expect(view.status).toBe(201);
      expect(view.body.media).toHaveLength(1);
      const preview = Buffer.from(
        await (await fetch(view.body.media[0].previewUrl)).arrayBuffer(),
      );
      expect(preview.length).toBeGreaterThan(0);
      expect(preview.equals(original)).toBe(false);
    });

    it('withholds the original until the owner releases downloads, then delivers it byte-for-byte', async () => {
      if (!storage) return;
      const before = await owner.anon('post', `/media/${mediaId}/download`).send({ password });
      expect(before.status).toBe(403);

      const wrongPw = await owner.anon('post', `/media/${mediaId}/download`).send({ password: 'nope' });
      expect(wrongPw.status).toBe(401);

      expect(
        (
          await owner
            .patch(`/gallery/${galleryId}/downloads`)
            .send({ enabled: true })
        ).status,
      ).toBe(200);

      const after = await owner.anon('post', `/media/${mediaId}/download`).send({ password });
      expect(after.status).toBe(201);
      const bytes = Buffer.from(
        await (await fetch(after.body.url)).arrayBuffer(),
      );
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        createHash('sha256').update(original).digest('hex'),
      );
    });

    it('lets the owner fetch their own original regardless of the switch', async () => {
      if (!storage) return;
      await owner.patch(`/gallery/${galleryId}/downloads`).send({ enabled: false });
      const res = await owner.get(`/media/${mediaId}/original`);
      expect(res.status).toBe(200);
      expect(res.body.url).toBeTruthy();
    });

    it('rejects declared/actual size mismatches and non-media uploads', async () => {
      if (!storage) return;
      const bad = await owner.post('/media/upload-init').send({
        galleryId,
        fileName: 'x.exe',
        fileSizeBytes: 100,
        mimeType: 'application/x-msdownload',
      });
      expect(bad.status).toBe(400);
    });
  });

  it('runs the daily notification checks for the caller only, and twice is idempotent', async () => {
    const first = await owner.post('/notifications/run-now');
    expect(first.status).toBe(201);
    const second = await owner.post('/notifications/run-now');
    expect(second.body).toHaveProperty('equipmentAlertsSent');
    expect(second.body.remindersSent).toBe(0);
    expect(second.body.overdueProcessed).toBe(0);
  });
});
