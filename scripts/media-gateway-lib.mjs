// Decides which requests may reach local MinIO from the internet.
//
// MinIO's admin login is the demo value checked into .env.example, so the
// store itself cannot be published. Only three kinds of request get through:
// anonymous reads of public previews, CORS preflights, and object reads/writes
// presigned with the app's limited browser key. Everything else (admin key,
// Authorization headers, bucket listings, deletes, sub-resources such as
// ?policy) is refused before it reaches MinIO.

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'PUT', 'OPTIONS']);
const ALLOWED_QUERY = /^(x-amz-[a-z0-9-]+|x-id|response-content-disposition|response-content-type)$/i;
const PUBLIC_PREFIX = 'previews/';

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
  if (req.headers['x-amz-copy-source'] !== undefined) return deny(403, 'copy not allowed');

  let url;
  try {
    url = new URL(req.url, 'http://gateway.invalid');
  } catch {
    return deny(400, 'bad url');
  }
  if (req.url.includes('..') || req.url.includes('//')) return deny(400, 'bad path');

  const prefix = `/${bucket}/`;
  if (!url.pathname.startsWith(prefix)) return deny(404, 'unknown bucket');
  let key;
  try {
    key = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return deny(400, 'bad path');
  }
  if (!key || key.endsWith('/')) return deny(403, 'listing not allowed');
  if (key.split('/').some((segment) => segment === '.' || segment === '..' || segment === '')) {
    return deny(400, 'bad path');
  }

  for (const name of url.searchParams.keys()) {
    if (!ALLOWED_QUERY.test(name)) return deny(403, `query parameter ${name} not allowed`);
  }

  if (method === 'OPTIONS') return { ok: true };

  const credential = url.searchParams.get('X-Amz-Credential');
  if (credential === null) {
    if ((method === 'GET' || method === 'HEAD') && key.startsWith(PUBLIC_PREFIX)) return { ok: true };
    return deny(403, 'signature required');
  }
  if (credential.split('/')[0] !== browserAccessKey) return deny(403, 'key not allowed');
  return { ok: true };
}
