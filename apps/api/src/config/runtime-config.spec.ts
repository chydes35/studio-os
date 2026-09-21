import { getCorsOrigins, validateRuntimeConfig } from './runtime-config.js';

const validEnv = {
  AUTH_SECRET: 'a'.repeat(32),
  WEB_APP_URL: 'http://localhost:3000',
};

describe('validateRuntimeConfig', () => {
  it('rejects a missing, short, or checked-in example auth secret', () => {
    expect(() => validateRuntimeConfig({ ...validEnv, AUTH_SECRET: undefined })).toThrow('AUTH_SECRET');
    expect(() => validateRuntimeConfig({ ...validEnv, AUTH_SECRET: 'a'.repeat(15) })).toThrow('AUTH_SECRET');
    expect(() => validateRuntimeConfig({ ...validEnv, AUTH_SECRET: 'generate-with-openssl-rand-base64-32' })).toThrow('AUTH_SECRET');
  });

  it('requires explicit non-local browser origins in production', () => {
    expect(() => validateRuntimeConfig({ ...validEnv, NODE_ENV: 'production', AUTH_SECRET: 'a'.repeat(31) })).toThrow('AUTH_SECRET');
    expect(() => validateRuntimeConfig({ ...validEnv, NODE_ENV: 'production' })).toThrow('CORS_ORIGINS');
    expect(() => validateRuntimeConfig({ ...validEnv, NODE_ENV: 'production', CORS_ORIGINS: 'http://localhost:3000' })).toThrow('localhost');
    expect(validateRuntimeConfig({ ...validEnv, NODE_ENV: 'production', CORS_ORIGINS: 'https://studio.example.com' }).CORS_ORIGINS).toBe('https://studio.example.com');
  });

  it('parses an allowlist of browser origins', () => {
    expect([...getCorsOrigins({ CORS_ORIGINS: 'https://app.example.com, https://preview.example.com' })]).toEqual([
      'https://app.example.com',
      'https://preview.example.com',
    ]);
  });
});
