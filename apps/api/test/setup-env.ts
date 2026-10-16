// Runs before any test file imports the app, so ConfigModule (which never
// overrides variables that already exist) sees these values instead of the
// developer's real .env.

const DEFAULT_E2E_DB = 'postgresql://studio_os:studio_os@localhost:5433/studio_os_test';
const url = process.env.E2E_DATABASE_URL ?? DEFAULT_E2E_DB;

// These tests create and never delete data, and hammer money paths. Refuse to
// run against anything that isn't obviously a throwaway database.
const dbName = new URL(url).pathname.replace(/^\//, '');
if (!/_(test|ci)$/.test(dbName)) {
  throw new Error(
    `Refusing to run e2e tests against database "${dbName}". Its name must end in _test or _ci.`,
  );
}

process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET ??= 'e2e-only-secret-not-used-anywhere-else';
process.env.WEB_APP_URL ??= 'http://localhost:3000';
process.env.R2_ENDPOINT ??= 'http://localhost:9000';
process.env.R2_ACCESS_KEY_ID ??= 'studio_os';
process.env.R2_SECRET_ACCESS_KEY ??= 'studio_os_minio';
process.env.R2_BUCKET_NAME ??= 'studio-os-media';
process.env.R2_PUBLIC_URL ??= 'http://localhost:9000/studio-os-media';
// The suite exercises unconfigured-provider behaviour; make sure a developer's
// real keys can never leak into it and send a real email or charge.
for (const key of [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'MUX_TOKEN_ID',
  'MUX_TOKEN_SECRET',
]) {
  delete process.env[key];
}
// Presigned links go straight to the local store here, not through a public
// media gateway. Empty rather than deleted: ConfigModule refills deleted keys
// from .env, but never overrides one that is already set.
// Same for sign-up: the suite registers owners freely.
for (const key of ['R2_PUBLIC_ENDPOINT', 'R2_PRESIGN_ACCESS_KEY_ID', 'R2_PRESIGN_SECRET_ACCESS_KEY', 'REGISTRATION_OPEN']) {
  process.env[key] = '';
}
