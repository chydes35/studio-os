import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { StorageService } from './storage.service.js';

function storageWith(env: Record<string, string>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new StorageService(config);
}

const LOCAL = {
  R2_ENDPOINT: 'http://localhost:9000',
  R2_ACCESS_KEY_ID: 'admin-key',
  R2_SECRET_ACCESS_KEY: 'admin-secret',
  R2_BUCKET_NAME: 'studio-os-media',
};

describe('StorageService presigned URLs', () => {
  it('signs against the storage endpoint with the main key by default', async () => {
    const url = new URL(await storageWith(LOCAL).getPresignedGetUrl('originals/g/m-a.jpg'));
    expect(url.origin).toBe('http://localhost:9000');
    expect(url.pathname).toBe('/studio-os-media/originals/g/m-a.jpg');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^admin-key\//);
  });

  it('signs browser URLs for the public endpoint with the limited key', async () => {
    const storage = storageWith({
      ...LOCAL,
      R2_PUBLIC_ENDPOINT: 'https://media.example.com',
      R2_PRESIGN_ACCESS_KEY_ID: 'browser-key',
      R2_PRESIGN_SECRET_ACCESS_KEY: 'browser-secret',
    });

    for (const signed of [
      await storage.getPresignedGetUrl('contracts/c.pdf'),
      await storage.getPresignedDownloadUrl('originals/g/m-a.jpg', 'a.jpg'),
      await storage.createPresignedPutUrl('originals/g/m-b.jpg', 'image/jpeg', 10),
    ]) {
      const url = new URL(signed);
      expect(url.origin).toBe('https://media.example.com');
      expect(url.pathname.startsWith('/studio-os-media/')).toBe(true);
      expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^browser-key\//);
    }
  });

  it('refuses a limited key without its secret', () => {
    expect(() => storageWith({ ...LOCAL, R2_PRESIGN_ACCESS_KEY_ID: 'browser-key' })).toThrow(
      /R2_PRESIGN_SECRET_ACCESS_KEY/,
    );
  });

  it('refuses a public endpoint without a limited key rather than signing with the main key', () => {
    expect(() => storageWith({ ...LOCAL, R2_PUBLIC_ENDPOINT: 'https://media.example.com' })).toThrow(
      /R2_PUBLIC_ENDPOINT requires/,
    );
  });

  it('keeps path-style URLs for the public endpoint even when no local endpoint is set', async () => {
    const storage = storageWith({
      R2_ACCOUNT_ID: 'acct',
      R2_ACCESS_KEY_ID: 'admin-key',
      R2_SECRET_ACCESS_KEY: 'admin-secret',
      R2_BUCKET_NAME: 'studio-os-media',
      R2_PUBLIC_ENDPOINT: 'https://media.example.com',
      R2_PRESIGN_ACCESS_KEY_ID: 'browser-key',
      R2_PRESIGN_SECRET_ACCESS_KEY: 'browser-secret',
    });
    const url = new URL(await storage.getPresignedGetUrl('originals/g/m-a.jpg'));
    expect(url.hostname).toBe('media.example.com');
    expect(url.pathname).toBe('/studio-os-media/originals/g/m-a.jpg');
  });

  it('derives public preview URLs from the public endpoint, ignoring R2_PUBLIC_URL', () => {
    const limited = { R2_PRESIGN_ACCESS_KEY_ID: 'browser-key', R2_PRESIGN_SECRET_ACCESS_KEY: 'browser-secret' };
    expect(
      storageWith({
        ...LOCAL,
        ...limited,
        R2_PUBLIC_ENDPOINT: 'https://media.example.com/',
        R2_PUBLIC_URL: 'http://localhost:9000/studio-os-media',
      }).publicUrl('previews/g/m.jpg'),
    ).toBe('https://media.example.com/studio-os-media/previews/g/m.jpg');
    expect(storageWith({ ...LOCAL, R2_PUBLIC_URL: 'https://cdn.example.com' }).publicUrl('previews/g/m.jpg')).toBe(
      'https://cdn.example.com/previews/g/m.jpg',
    );
  });
});
