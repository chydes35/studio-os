#!/usr/bin/env node
// Refuses to put Studio OS on the internet while it is still configured for
// localhost or while any account still uses the published seed password.
//
//   node scripts/check-public-ready.mjs            # full checks (tunnel mode)
//   node scripts/check-public-ready.mjs --local    # local rehearsal: http allowed
//
// Reads the already-exported environment (serve-public.sh sources .env and
// .env.public first). Exits non-zero with every problem listed.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = process.argv.includes('--local');
const env = process.env;
const problems = [];

const SEED_PASSWORD = 'devpassword123';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
const isLoopback = (url) => LOOPBACK.has(url.hostname) || url.hostname.endsWith('.localhost');

function requireUrl(name, { https = !local } = {}) {
  const value = env[name];
  if (!value) {
    problems.push(`${name} is not set`);
    return undefined;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    problems.push(`${name} is not a URL: ${value}`);
    return undefined;
  }
  if (https && url.protocol !== 'https:') problems.push(`${name} must be https:// for public use (got ${value})`);
  if (!local && isLoopback(url)) problems.push(`${name} still points at ${url.hostname}`);
  return url;
}

requireUrl('WEB_APP_URL');
requireUrl('NEXT_PUBLIC_API_URL');
const mediaEndpoint = requireUrl('R2_PUBLIC_ENDPOINT');
if (mediaEndpoint) {
  let previewOrigin;
  try {
    previewOrigin = new URL(env.R2_PUBLIC_URL ?? '').origin;
  } catch {
    problems.push('R2_PUBLIC_URL is not set or not a URL');
  }
  if (previewOrigin !== undefined && previewOrigin !== mediaEndpoint.origin) {
    problems.push('R2_PUBLIC_URL must live on R2_PUBLIC_ENDPOINT so previews go through the media gateway');
  }
}
if (env.CORS_ORIGINS !== env.WEB_APP_URL && !local) {
  problems.push('CORS_ORIGINS should be exactly WEB_APP_URL for public use');
}
if (!env.R2_PRESIGN_ACCESS_KEY_ID || !env.R2_PRESIGN_SECRET_ACCESS_KEY) {
  problems.push('R2_PRESIGN_ACCESS_KEY_ID / R2_PRESIGN_SECRET_ACCESS_KEY are not set (run scripts/create-browser-key.sh)');
} else if (env.R2_PRESIGN_ACCESS_KEY_ID === env.R2_ACCESS_KEY_ID) {
  problems.push('R2_PRESIGN_ACCESS_KEY_ID must be the limited browser key, not the storage admin key');
}
if (!local && !env.REGISTRATION_OPEN) {
  problems.push('REGISTRATION_OPEN is not set: use "false" to close public sign-up (or "true" to allow it on purpose)');
}
if (!local && env.TRUST_PROXY !== '1') problems.push('TRUST_PROXY must be 1 behind cloudflared');

// Seed password check: compare every account's hash with the published dev password.
try {
  const dbName = new URL(env.DATABASE_URL ?? '').pathname.slice(1);
  const hashes = execFileSync(
    'docker',
    ['exec', 'studio_os_postgres', 'psql', '-U', 'studio_os', '-d', dbName, '-Atc', 'select email, "passwordHash" from "User"'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|'));
  const bcrypt = createRequire(path.join(root, 'apps/api/package.json'))('bcryptjs');
  for (const [email, hash] of hashes) {
    if (hash && bcrypt.compareSync(SEED_PASSWORD, hash)) {
      problems.push(`${email} still uses the published seed password; change it on the Account page first`);
    }
  }
} catch (err) {
  problems.push(`could not check account passwords: ${err.message.split('\n')[0]}`);
}

if (problems.length) {
  console.error('Not ready to serve publicly:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Public readiness checks passed${local ? ' (local rehearsal)' : ''}.`);
