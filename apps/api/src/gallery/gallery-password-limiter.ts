import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const MAX_FAILED_GALLERY_PASSWORDS = 10;
export const GALLERY_PASSWORD_WINDOW_MS = 15 * 60_000;

/**
 * Counts wrong gallery passwords per (gallery, client IP), across every route
 * that checks one. The per-route rate limits alone let a guesser spread
 * attempts over view, download, favorite and comment (about 190 a minute
 * combined); this caps wrong guesses at 10 per 15 minutes per gallery, no
 * matter which route they arrive on. Keying on the IP too means a guesser
 * can't lock the real client out of their own gallery.
 *
 * In memory, like the rate limiter, so each API instance counts separately.
 */
@Injectable()
export class GalleryPasswordLimiter {
  private readonly failures = new Map<string, { count: number; windowStart: number }>();

  /** Throws 429 while this client is locked out of this gallery. */
  assertAllowed(galleryId: string, clientIp: string, now = Date.now()) {
    const entry = this.failures.get(this.key(galleryId, clientIp));
    if (!entry || now - entry.windowStart >= GALLERY_PASSWORD_WINDOW_MS) return;
    if (entry.count >= MAX_FAILED_GALLERY_PASSWORDS) {
      throw new HttpException(
        'Too many incorrect passwords. Please wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(galleryId: string, clientIp: string, now = Date.now()) {
    const key = this.key(galleryId, clientIp);
    const entry = this.failures.get(key);
    if (!entry || now - entry.windowStart >= GALLERY_PASSWORD_WINDOW_MS) {
      this.failures.set(key, { count: 1, windowStart: now });
      this.prune(now);
    } else {
      entry.count++;
    }
  }

  recordSuccess(galleryId: string, clientIp: string) {
    this.failures.delete(this.key(galleryId, clientIp));
  }

  private key(galleryId: string, clientIp: string) {
    return `${galleryId}|${clientIp}`;
  }

  /** Keeps the map from growing without bound under a spray of guesses. */
  private prune(now: number) {
    if (this.failures.size < 10_000) return;
    for (const [key, entry] of this.failures) {
      if (now - entry.windowStart >= GALLERY_PASSWORD_WINDOW_MS) this.failures.delete(key);
    }
  }
}
