// Decides which requests may reach local MinIO from the internet.
//
// MinIO's admin login is the demo value checked into .env.example, so the
// store itself cannot be published. Only three kinds of request get through:
// anonymous reads of public previews, CORS preflights, and object reads/writes
// presigned with the app's limited browser key. Everything else (admin key,
// Authorization headers, bucket listings, deletes, sub-resources such as
// ?policy) is refused before it reaches MinIO.
//
// The gateway forwards the raw request line, so every decision here is made on
// the raw bytes, never on a normalized copy MinIO might not agree with: the raw
// path must already be in normal form and every query name must be one of an
// exact, case-sensitive allowlist that appears once.

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'PUT', 'OPTIONS']);
const PUBLIC_PREFIX = 'previews/';
// The API only ever signs uploads under these prefixes. previews/ and
// contracts/ are written server-side with the admin client.
const UPLOAD_PREFIXES = ['originals/', 'locations/'];

const SIGV4_QUERY = new Set([
  'X-Amz-Algorithm',
  'X-Amz-Credential',
  'X-Amz-Date',
  'X-Amz-Expires',
  'X-Amz-SignedHeaders',
  'X-Amz-Signature',
  'X-Amz-Content-Sha256',
  'x-id',
]);
// Only meaningful (and only allowed) on a signed request.
const SIGNED_ONLY_QUERY = new Set(['response-content-disposition', 'response-content-type']);

/**
 * @param {{ method: string, url: string, headers: Record<string, string | string[] | undefined> }} req
 * @param {{ bucket: string, browserAccessKey: string }} options
 * @returns {{ ok: true } | { ok: false, status: number, reason: string }}
 */
export function checkMediaRequest(req, { bucket, browserAccessKey }) {
  const deny = (status, reason) => ({ ok: false, status, reason });
  const method = req.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) return deny(405, 'method not allowed');
  if (req.headers.authorization !== undefined) return deny(403, 'header auth not allowed');
  // Browsers send none of MinIO's own control headers. Refusing them all keeps
  // a presigned PUT from carrying instructions the signature never covered
  // (copy source, snowball auto-extract, x-minio-* internals, metadata/ACL).
  for (const name of Object.keys(req.headers)) {
    const lower = name.toLowerCase();
    if ((lower.startsWith('x-amz-') && lower !== 'x-amz-content-sha256') || lower.startsWith('x-minio-')) {
      return deny(403, `header ${lower} not allowed`);
    }
  }
  if (
    method === 'PUT' &&
    /^(application\/x-www-form-urlencoded|multipart\/)/i.test(String(req.headers['content-type'] ?? ''))
  ) {
    return deny(403, 'form bodies not allowed');
  }

  if (!req.url.startsWith('/')) return deny(400, 'bad url');
  const queryStart = req.url.indexOf('?');
  const rawPath = queryStart === -1 ? req.url : req.url.slice(0, queryStart);
  const rawQuery = queryStart === -1 ? '' : req.url.slice(queryStart + 1);
  if (rawQuery.includes('#') || rawPath.includes('#') || rawPath.includes('\\')) return deny(400, 'bad path');

  // MinIO sees rawPath. If URL parsing would change it (dot segments in any
  // encoding, backslashes), the two parsers could disagree about the key.
  let normalized;
  try {
    normalized = new URL(rawPath, 'http://gateway.invalid').pathname;
  } catch {
    return deny(400, 'bad url');
  }
  if (normalized !== rawPath) return deny(400, 'path not in normal form');

  const prefix = `/${bucket}/`;
  if (!rawPath.startsWith(prefix)) return deny(404, 'unknown bucket');
  let key;
  try {
    key = decodeURIComponent(rawPath.slice(prefix.length));
  } catch {
    return deny(400, 'bad path');
  }
  if (!key || key.endsWith('/')) return deny(403, 'listing not allowed');
  if (key.split('/').some((segment) => segment === '.' || segment === '..' || segment === '')) {
    return deny(400, 'bad path');
  }

  const params = new Map();
  if (rawQuery) {
    for (const pair of rawQuery.split('&')) {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      if (!SIGV4_QUERY.has(name) && !SIGNED_ONLY_QUERY.has(name)) {
        return deny(403, `query parameter ${name} not allowed`);
      }
      if (params.has(name)) return deny(400, `query parameter ${name} repeated`);
      params.set(name, value);
    }
  }

  if (method === 'OPTIONS') return { ok: true };

  const credential = params.get('X-Amz-Credential');
  if (credential === undefined) {
    if (params.size > 0) return deny(403, 'query parameters need a signature');
    if ((method === 'GET' || method === 'HEAD') && key.startsWith(PUBLIC_PREFIX)) return { ok: true };
    return deny(403, 'signature required');
  }
  let accessKey;
  try {
    accessKey = decodeURIComponent(credential).split('/')[0];
  } catch {
    return deny(400, 'bad credential');
  }
  if (accessKey !== browserAccessKey) return deny(403, 'key not allowed');
  if (method === 'PUT' && !UPLOAD_PREFIXES.some((p) => key.startsWith(p))) {
    return deny(403, 'uploads only under originals/ and locations/');
  }
  return { ok: true };
}
