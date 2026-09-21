const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** What may be interpolated into an email body; anything else must be formatted first. */
export type HtmlValue = string | number | null | undefined;

export function escapeHtml(value: HtmlValue): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!);
}

/**
 * Tagged template for email bodies: every `${value}` is HTML-escaped, only
 * the literal template text is trusted. Client names, shoot types, etc. come
 * from the public booking portal, so interpolating them raw let anyone put
 * their own markup and links into emails sent in the studio's name.
 */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): string {
  return strings.reduce(
    (out, str, i) => out + str + (i < values.length ? escapeHtml(values[i]) : ''),
    '',
  );
}

/** Subjects are plain text: collapse newlines/control chars into single spaces. */
export function plainSubject(value: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * A moment in time (e.g. a shoot start) as the studio's clients should read
 * it, in the studio's zone. `toLocaleString()` would use the API server's
 * zone, which is UTC in production.
 */
export function formatDateTime(at: Date, timeZone: string): string {
  return at.toLocaleString('en-US', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

/**
 * A date-only field (invoice due date, service due date). These are entered
 * as YYYY-MM-DD and stored as midnight UTC, so they must be formatted in UTC;
 * any zone behind UTC would show the previous day.
 */
export function formatDateOnly(date: Date): string {
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'long' });
}
