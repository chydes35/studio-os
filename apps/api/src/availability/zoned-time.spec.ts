import { addDays, dayOfWeek, zonedDateStr, zonedWallTimeToUtc } from './zoned-time.js';

const iso = (d: Date) => d.toISOString();

describe('zonedWallTimeToUtc', () => {
  it('converts Chicago daylight time (UTC-5)', () => {
    expect(iso(zonedWallTimeToUtc('2026-09-28', '19:00', 'America/Chicago'))).toBe(
      '2026-09-29T00:00:00.000Z',
    );
  });

  it('converts Chicago standard time (UTC-6)', () => {
    expect(iso(zonedWallTimeToUtc('2026-12-01', '09:00', 'America/Chicago'))).toBe(
      '2026-12-01T15:00:00.000Z',
    );
  });

  it('uses the post-change offset on the fall-back day', () => {
    // US DST ends 2026-11-01 at 02:00; 17:00 that day is CST (UTC-6).
    expect(iso(zonedWallTimeToUtc('2026-11-01', '17:00', 'America/Chicago'))).toBe(
      '2026-11-01T23:00:00.000Z',
    );
  });

  it('uses the post-change offset on the spring-forward day', () => {
    // US DST starts 2026-03-08 at 02:00; 09:00 that day is CDT (UTC-5).
    expect(iso(zonedWallTimeToUtc('2026-03-08', '09:00', 'America/Chicago'))).toBe(
      '2026-03-08T14:00:00.000Z',
    );
  });

  it('handles half-hour offsets and zones ahead of UTC', () => {
    expect(iso(zonedWallTimeToUtc('2026-09-28', '09:00', 'Asia/Kolkata'))).toBe(
      '2026-09-28T03:30:00.000Z',
    );
    // 08:00 in Auckland (NZDT, UTC+13) is the previous UTC day.
    expect(iso(zonedWallTimeToUtc('2026-12-15', '08:00', 'Pacific/Auckland'))).toBe(
      '2026-12-14T19:00:00.000Z',
    );
  });

  it('is the identity for UTC', () => {
    expect(iso(zonedWallTimeToUtc('2026-09-28', '00:00', 'UTC'))).toBe('2026-09-28T00:00:00.000Z');
  });
});

describe('zonedDateStr', () => {
  it("returns the studio's calendar date, not UTC's", () => {
    // 00:30Z on the 29th is still 7:30pm on the 28th in Chicago.
    expect(zonedDateStr(new Date('2026-09-29T00:30:00Z'), 'America/Chicago')).toBe('2026-09-28');
    expect(zonedDateStr(new Date('2026-09-29T00:30:00Z'), 'UTC')).toBe('2026-09-29');
  });

  it('round-trips with zonedWallTimeToUtc', () => {
    for (const tz of ['America/Chicago', 'Asia/Kolkata', 'Pacific/Auckland', 'UTC']) {
      expect(zonedDateStr(zonedWallTimeToUtc('2026-09-28', '23:30', tz), tz)).toBe('2026-09-28');
    }
  });
});

describe('calendar helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('computes day of week from the date alone', () => {
    expect(dayOfWeek('2026-09-28')).toBe(1); // Monday
    expect(dayOfWeek('2026-09-27')).toBe(0); // Sunday
  });
});
