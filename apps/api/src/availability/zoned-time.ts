/**
 * Wall-clock <-> UTC conversion for an IANA time zone, via Intl (no Temporal
 * in this Node yet, and no date library dependency needed for this much).
 *
 * All slot math must go through these instead of `new Date('YYYY-MM-DDT..')`
 * / `setHours()`, which silently use the API server's own zone — UTC in
 * production — rather than the studio's.
 */

/** Offset of `timeZone` from UTC at instant `at`, in ms (e.g. CDT = -5h). */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wallAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The UTC instant at which a wall clock in `timeZone` reads `dateStr`
 * (YYYY-MM-DD) at `time` (HH:MM). Two passes so the offset is taken at the
 * target instant itself, which matters on DST-change days. A wall time that
 * doesn't exist (the skipped spring-forward hour) lands an hour later.
 */
export function zonedWallTimeToUtc(dateStr: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  const wallAsUtc = Date.UTC(year, month - 1, day, hours, minutes);

  const firstGuess = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone);
  return new Date(wallAsUtc - offsetMs(new Date(firstGuess), timeZone));
}

/** The calendar date (YYYY-MM-DD) in `timeZone` at instant `at`. */
export function zonedDateStr(at: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Calendar arithmetic on a YYYY-MM-DD string, independent of any zone. */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, matching AvailabilityRule.dayOfWeek. */
export function dayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
