import type { NestExpressApplication } from '@nestjs/platform-express';
import { Actor, createTestApp } from './helpers.js';

const studioDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

describe('owner booking scheduling', () => {
  let app: NestExpressApplication;
  let owner: Actor;
  let clientId: string;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await Actor.register(app, 'owner-scheduling');
    const client = await owner.post('/clients').send({
      name: 'Scheduling Client',
      email: `${Date.now()}@scheduling.e2e.test`,
    });
    expect(client.status).toBe(201);
    clientId = client.body.id;
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const rule = await owner.post('/availability/rules').send({
        dayOfWeek,
        startTime: '08:00',
        endTime: '17:00',
        bufferMinutes: 0,
      });
      expect(rule.status).toBe(201);
    }
  });

  afterAll(() => app.close());

  it('creates and reschedules only into open studio-time slots', async () => {
    const date = studioDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    const available = await owner.get('/availability/owner-slots').query({ date, durationMins: 60 });
    expect(available.status).toBe(200);
    expect(available.body.timezone).toBe('America/Chicago');
    expect(available.body.slots.length).toBeGreaterThan(1);

    const durationWithoutTime = await owner.post('/bookings').send({
      clientId,
      shootType: 'Unscheduled with duration',
      durationMins: 60,
    });
    expect(durationWithoutTime.status).toBe(400);

    const firstSlot = available.body.slots[0] as string;
    const created = await owner.post('/bookings').send({
      clientId,
      shootType: 'Portrait',
      scheduledAt: firstSlot,
      durationMins: 60,
      notes: 'Call before arrival',
    });
    expect(created.status).toBe(201);
    expect(created.body.scheduledAt).toBe(firstSlot);
    expect(created.body.durationMins).toBe(60);
    expect(created.body.notes).toBe('Call before arrival');

    const conflict = await owner.post('/bookings').send({
      clientId,
      shootType: 'Conflicting shoot',
      scheduledAt: firstSlot,
      durationMins: 60,
    });
    expect(conflict.status).toBe(400);

    const raceSlot = available.body.slots[2] as string;
    const concurrent = await Promise.all([
      owner.post('/bookings').send({ clientId, shootType: 'Concurrent A', scheduledAt: raceSlot, durationMins: 60 }),
      owner.post('/bookings').send({ clientId, shootType: 'Concurrent B', scheduledAt: raceSlot, durationMins: 60 }),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 400]);

    const editSlots = await owner.get('/availability/owner-slots').query({
      date,
      durationMins: 60,
      excludeBookingId: created.body.id,
    });
    expect(editSlots.status).toBe(200);
    expect(editSlots.body.slots).toContain(firstSlot);

    const nextSlot = editSlots.body.slots.find((slot: string) => slot !== firstSlot);
    expect(nextSlot).toBeDefined();
    const updated = await owner.patch(`/bookings/${created.body.id}`).send({
      scheduledAt: nextSlot,
      durationMins: 60,
      notes: 'Updated arrival details',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.scheduledAt).toBe(nextSlot);
    expect(updated.body.notes).toBe('Updated arrival details');

    const unscheduled = await owner.patch(`/bookings/${created.body.id}`).send({
      scheduledAt: null,
      durationMins: null,
    });
    expect(unscheduled.status).toBe(200);
    expect(unscheduled.body.scheduledAt).toBeNull();
    expect(unscheduled.body.durationMins).toBeNull();

    const scheduledAgain = await owner.patch(`/bookings/${created.body.id}`).send({
      scheduledAt: firstSlot,
      durationMins: 60,
    });
    expect(scheduledAgain.status).toBe(200);
    const closed = await owner.patch(`/bookings/${created.body.id}/stage`).send({ stage: 'CLOSED' });
    expect(closed.status).toBe(200);
    const replacement = await owner.post('/bookings').send({
      clientId,
      shootType: 'Replacement shoot',
      scheduledAt: firstSlot,
      durationMins: 60,
    });
    expect(replacement.status).toBe(201);
    const reopenConflict = await owner.patch(`/bookings/${created.body.id}/stage`).send({ stage: 'BOOKED' });
    expect(reopenConflict.status).toBe(400);
  });
});
