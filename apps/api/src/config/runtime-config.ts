import { parseRegistrationOpen } from '@repo/shared';

const EXAMPLE_AUTH_SECRET = 'generate-with-openssl-rand-base64-32';

function parseOrigins(value: string): string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin');
  }

  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS origin is not a valid URL: ${origin}`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
      throw new Error(`CORS origin must be an HTTP(S) origin with no path: ${origin}`);
    }
  }

  return origins;
}

/**
 * ConfigModule calls this before Nest starts. Failing at startup is safer than
 * signing production tokens with the checked-in example secret or accepting
 * requests from every browser origin.
 */
export function validateRuntimeConfig(env: Record<string, string | undefined>) {
  const authSecret = env.AUTH_SECRET?.trim();
  const isProduction = env.NODE_ENV === 'production';
  const minimumSecretLength = isProduction ? 32 : 16;
  if (!authSecret || authSecret === EXAMPLE_AUTH_SECRET || authSecret.length < minimumSecretLength) {
    throw new Error(
      `AUTH_SECRET must be a unique random value of at least ${minimumSecretLength} characters`,
    );
  }

  const configuredOrigins = env.CORS_ORIGINS ?? (isProduction ? undefined : env.WEB_APP_URL);
  if (!configuredOrigins) {
    throw new Error('CORS_ORIGINS is required when NODE_ENV is production');
  }

  const corsOrigins = parseOrigins(configuredOrigins);
  if (isProduction && corsOrigins.some((origin) => new URL(origin).hostname === 'localhost')) {
    throw new Error('CORS_ORIGINS cannot use localhost when NODE_ENV is production');
  }

  parseRegistrationOpen(env.REGISTRATION_OPEN);

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: env.NOTIFICATION_TIME_ZONE || 'America/Chicago' });
  } catch {
    throw new Error('NOTIFICATION_TIME_ZONE must be a valid IANA time zone');
  }

  return { ...env, CORS_ORIGINS: corsOrigins.join(',') };
}

export function getCorsOrigins(env: Record<string, string | undefined>): Set<string> {
  return new Set(parseOrigins(env.CORS_ORIGINS ?? env.WEB_APP_URL ?? 'http://localhost:3000'));
}
