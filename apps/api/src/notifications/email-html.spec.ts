import { escapeHtml, formatDateOnly, formatDateTime, html, plainSubject } from './email-html.js';

describe('email-html', () => {
  it('escapes every interpolated value but keeps the template markup', () => {
    const name = '<a href="https://evil.example">Click</a> & "win"';
    expect(html`<p>Hi ${name},</p>`).toBe(
      '<p>Hi &lt;a href=&quot;https://evil.example&quot;&gt;Click&lt;/a&gt; &amp; &quot;win&quot;,</p>',
    );
  });

  it('escapes nested template strings and handles null/undefined', () => {
    const dueAt = null as string | null;
    expect(html`<p>x${dueAt ? ` (due ${dueAt})` : ''}</p>`).toBe('<p>x</p>');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('flattens newlines and control characters in subjects', () => {
    expect(plainSubject('Reminder: your Wedding\r\nBcc: x@y.z shoot')).toBe(
      'Reminder: your Wedding Bcc: x@y.z shoot',
    );
  });

  it("formats shoot times in the studio's zone, not the server's", () => {
    const shoot = new Date('2026-09-24T10:00:00Z');
    expect(formatDateTime(shoot, 'UTC')).toBe('Thursday, September 24, 2026 at 10:00 AM');
    expect(formatDateTime(shoot, 'America/Chicago')).toBe('Thursday, September 24, 2026 at 5:00 AM');
  });

  it('keeps the calendar date of date-only fields stored as midnight UTC', () => {
    // A due date entered as 2026-09-01 must not become Aug 31 anywhere.
    expect(formatDateOnly(new Date('2026-09-01T00:00:00Z'))).toBe('September 1, 2026');
  });
});
