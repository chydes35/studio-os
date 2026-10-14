import type { NestExpressApplication } from '@nestjs/platform-express';
import { Actor, bigJpeg, createTestApp, storageIsUp } from './helpers.js';

/**
 * Two independent studios on one API. Owner A builds a full booking with
 * everything hanging off it; owner B then tries to read, change or attach to
 * each of those objects by id. Every attempt must fail, and A's data must be
 * exactly what it was before B started poking.
 */
describe('tenant isolation', () => {
  let app: NestExpressApplication;
  let a: Actor;
  let b: Actor;
  const ids: Record<string, string> = {};
  let storage = false;

  const denied = (res: { status: number; text: string }, what: string) => {
    expect(
      [401, 403, 404],
      `${what} should be refused but returned ${res.status}: ${res.text.slice(0, 200)}`,
    ).toContain(res.status);
  };

  beforeAll(async () => {
    app = await createTestApp();
    storage = await storageIsUp();
    a = await Actor.register(app, 'studio-a');
    b = await Actor.register(app, 'studio-b');

    const client = await a.post('/clients').send({ name: 'Client A', email: `c-${Date.now()}@e2e.test` });
    expect(client.status).toBe(201);
    ids.client = client.body.id;

    const booking = await a.post('/bookings').send({ clientId: ids.client, shootType: 'Wedding' });
    expect(booking.status).toBe(201);
    ids.booking = booking.body.id;

    ids.location = (await a.post('/locations').send({ name: 'Spot', latitude: 41.8, longitude: -87.6 })).body.id;
    ids.equipment = (await a.post('/equipment').send({ name: 'Camera' })).body.id;
    ids.expense = (await a.post('/expenses').send({ description: 'Lens', amountCents: 5000 })).body.id;
    ids.contractTemplate = (
      await a.post('/contract-templates').send({ name: 'T', bodyMarkdown: 'Hello {{client_name}}' })
    ).body.id;
    ids.questionnaireTemplate = (
      await a
        .post('/questionnaire-templates')
        .send({ name: 'Q', fields: [{ id: 'q1', label: 'Q1', type: 'text' }] })
    ).body.id;

    const invoice = await a
      .post(`/bookings/${ids.booking}/invoices`)
      .send({ lineItems: [{ description: 'Session', quantity: 1, unitAmountCents: 100_00 }] });
    expect(invoice.status).toBe(201);
    ids.invoice = invoice.body.id;

    const gallery = await a.post(`/bookings/${ids.booking}/gallery`).send({ password: 'secret1' });
    expect(gallery.status).toBe(201);
    ids.gallery = gallery.body.id;

    if (storage) {
      const bytes = await bigJpeg(800, 600);
      const init = await a.post('/media/upload-init').send({
        galleryId: ids.gallery,
        fileName: 'a.jpg',
        fileSizeBytes: bytes.length,
        mimeType: 'image/jpeg',
      });
      expect(init.status).toBe(201);
      ids.media = init.body.mediaId;
      await fetch(init.body.uploadUrl, { method: 'PUT', body: new Uint8Array(bytes) });
      const complete = await a.post(`/media/${ids.media}/complete`);
      expect(complete.status).toBe(201);
      expect(complete.body.processingStatus).toBe('pending');
    }
  });
  afterAll(() => app.close());

  it("B's lists never include A's records", async () => {
    for (const path of ['/clients', '/bookings', '/equipment', '/locations', '/expenses', '/contract-templates', '/questionnaire-templates']) {
      const res = await b.get(path);
      expect(res.status, path).toBe(200);
      expect(res.body, path).toEqual([]);
    }
  });

  it("B cannot read A's records by id", async () => {
    for (const path of [
      `/clients/${ids.client}`,
      `/bookings/${ids.booking}`,
      `/bookings/${ids.booking}/gallery`,
      `/bookings/${ids.booking}/invoices`,
      `/bookings/${ids.booking}/contract`,
      `/bookings/${ids.booking}/questionnaires`,
      `/bookings/${ids.booking}/equipment`,
    ]) {
      const res = await b.get(path);
      // A list endpoint may answer 200 with nothing; anything else must be a refusal.
      if (res.status === 200) expect(res.body === null || (Array.isArray(res.body) && res.body.length === 0), path).toBe(true);
      else denied(res, `GET ${path}`);
    }
  });

  it("B cannot change or attach to A's records", async () => {
    const attempts: [string, () => Promise<{ status: number; text: string }>][] = [
      ['stage', () => b.patch(`/bookings/${ids.booking}/stage`).send({ stage: 'CLOSED' })],
      ['edit A booking', () => b.patch(`/bookings/${ids.booking}`).send({ shootType: 'hijacked' })],
      ['edit A client', () => b.patch(`/clients/${ids.client}`).send({ name: 'hijacked' })],
      ['booking location', () => b.patch(`/bookings/${ids.booking}/location`).send({ locationId: null })],
      ['create booking on A client', () => b.post('/bookings').send({ clientId: ids.client, shootType: 'x' })],
      ['create booking at A location', async () => {
        const own = await b.post('/clients').send({ name: 'B client', email: `b-${Date.now()}@e2e.test` });
        return b.post('/bookings').send({ clientId: own.body.id, shootType: 'x', locationId: ids.location });
      }],
      ['expense on A booking', () => b.post('/expenses').send({ description: 'x', amountCents: 100, bookingId: ids.booking })],
      ['delete A expense', () => b.del(`/expenses/${ids.expense}`)],
      ['patch A equipment', () => b.patch(`/equipment/${ids.equipment}`).send({ name: 'hijacked' })],
      ['delete A equipment', () => b.del(`/equipment/${ids.equipment}`)],
      ['assign A equipment to A booking', () => b.post(`/bookings/${ids.booking}/equipment`).send({ equipmentId: ids.equipment })],
      ['patch A location', () => b.patch(`/locations/${ids.location}`).send({ name: 'hijacked' })],
      ['delete A location', () => b.del(`/locations/${ids.location}`)],
      ['delete A contract template', () => b.del(`/contract-templates/${ids.contractTemplate}`)],
      ['delete A questionnaire template', () => b.del(`/questionnaire-templates/${ids.questionnaireTemplate}`)],
      ['contract for A booking', () => b.post(`/bookings/${ids.booking}/contract`).send({ templateId: ids.contractTemplate, variables: {} })],
      ['questionnaire on A booking', () => b.post(`/bookings/${ids.booking}/questionnaires`).send({ templateId: ids.questionnaireTemplate })],
      ['invoice on A booking', () => b.post(`/bookings/${ids.booking}/invoices`).send({ lineItems: [{ description: 'x', quantity: 1, unitAmountCents: 100 }] })],
      ['send A invoice', () => b.patch(`/invoices/${ids.invoice}/send`)],
      ['mark A invoice paid', () => b.post(`/invoices/${ids.invoice}/mark-paid`).send({ amountCents: 100_00 })],
      ['gallery on A booking', () => b.post(`/bookings/${ids.booking}/gallery`).send({ password: 'hijack1' })],
      ['toggle A gallery downloads', () => b.patch(`/gallery/${ids.gallery}/downloads`).send({ enabled: true })],
      ['upload into A gallery', () => b.post('/media/upload-init').send({ galleryId: ids.gallery, fileName: 'x.jpg', fileSizeBytes: 10, mimeType: 'image/jpeg' })],
    ];
    for (const [what, attempt] of attempts) denied(await attempt(), what);
  });

  it("B cannot fetch A's originals", async () => {
    if (!storage) return;
    denied(await b.get(`/media/${ids.media}/original`), 'owner download of A media');
    denied(await b.post(`/media/${ids.media}/complete`), 'complete A media');
  });

  it("A's data is untouched after all of that", async () => {
    const invoice = await a.get(`/bookings/${ids.booking}/invoices`);
    expect(invoice.body).toHaveLength(1);
    expect(invoice.body[0].status).toBe('DRAFT');
    expect(invoice.body[0].paidCents).toBe(0);

    const booking = await a.get(`/bookings/${ids.booking}`);
    expect(booking.body.stage).not.toBe('CLOSED');
    expect(booking.body.shootType).toBe('Wedding');

    const client = await a.get(`/clients/${ids.client}`);
    expect(client.body.name).toBe('Client A');

    expect((await a.get('/equipment')).body).toHaveLength(1);
    expect((await a.get('/equipment')).body[0].name).toBe('Camera');
    expect((await a.get('/locations')).body).toHaveLength(1);
    expect((await a.get('/expenses')).body).toHaveLength(1);
    expect((await a.get(`/bookings/${ids.booking}/gallery`)).body.downloadsEnabled).toBe(false);
  });
});
