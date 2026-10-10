import {
  GALLERY_PASSWORD_WINDOW_MS,
  GalleryPasswordLimiter,
  MAX_FAILED_GALLERY_PASSWORDS,
} from './gallery-password-limiter.js';

function statusOf(fn: () => void): number | null {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as { getStatus(): number }).getStatus();
  }
}

describe('GalleryPasswordLimiter', () => {
  const t0 = 1_000_000;

  function failTimes(limiter: GalleryPasswordLimiter, n: number, at = t0) {
    for (let i = 0; i < n; i++) limiter.recordFailure('gal', 'ip', at);
  }

  it('allows attempts up to the limit, then refuses with 429', () => {
    const limiter = new GalleryPasswordLimiter();
    failTimes(limiter, MAX_FAILED_GALLERY_PASSWORDS - 1);
    expect(() => limiter.assertAllowed('gal', 'ip', t0)).not.toThrow();
    limiter.recordFailure('gal', 'ip', t0);
    expect(statusOf(() => limiter.assertAllowed('gal', 'ip', t0))).toBe(429);
  });

  it('lets the client try again once the window has passed', () => {
    const limiter = new GalleryPasswordLimiter();
    failTimes(limiter, MAX_FAILED_GALLERY_PASSWORDS);
    expect(() => limiter.assertAllowed('gal', 'ip', t0 + GALLERY_PASSWORD_WINDOW_MS)).not.toThrow();
  });

  it('a correct password clears the count', () => {
    const limiter = new GalleryPasswordLimiter();
    failTimes(limiter, MAX_FAILED_GALLERY_PASSWORDS - 1);
    limiter.recordSuccess('gal', 'ip');
    failTimes(limiter, MAX_FAILED_GALLERY_PASSWORDS - 1);
    expect(() => limiter.assertAllowed('gal', 'ip', t0)).not.toThrow();
  });

  it('counts each gallery and each client separately', () => {
    const limiter = new GalleryPasswordLimiter();
    failTimes(limiter, MAX_FAILED_GALLERY_PASSWORDS);
    expect(() => limiter.assertAllowed('other-gal', 'ip', t0)).not.toThrow();
    expect(() => limiter.assertAllowed('gal', 'other-ip', t0)).not.toThrow();
  });
});
