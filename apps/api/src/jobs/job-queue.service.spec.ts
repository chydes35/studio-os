import { dailyChecksKey } from './job-queue.service.js';

describe('daily schedule key', () => {
  it('waits until 9am in Chicago and makes one key on both sides of DST', () => {
    expect(dailyChecksKey(new Date('2026-03-08T13:59:00Z'), 'America/Chicago')).toBeNull();
    expect(dailyChecksKey(new Date('2026-03-08T14:00:00Z'), 'America/Chicago'))
      .toBe('daily-checks:2026-03-08');
    expect(dailyChecksKey(new Date('2026-11-01T14:59:00Z'), 'America/Chicago')).toBeNull();
    expect(dailyChecksKey(new Date('2026-11-01T15:00:00Z'), 'America/Chicago'))
      .toBe('daily-checks:2026-11-01');
    expect(dailyChecksKey(new Date('2026-11-01T23:00:00Z'), 'America/Chicago'))
      .toBe('daily-checks:2026-11-01');
  });
});
