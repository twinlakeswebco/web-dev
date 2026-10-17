// One photo per request: never buffer a complete 150 MB intake.
import { Buffer } from 'node:buffer';

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ORIGINS = new Set(['https://twinlakesweb.com', 'https://www.twinlakesweb.com']);
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = ['name', 'email', 'phone', 'business', 'business_description', 'primary_purpose', 'target_audience', 'primary_action', 'pages_needed', 'priority_offering', 'special_features', 'content_status', 'brand_assets', 'inspiration_sites', 'owns_domain', 'existing_web_presence', 'public_contact_info', 'timeline', 'budget', 'reference_links'];

class IntakeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (ORIGINS.has(origin)) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Photo-Index',
      'Access-Control-Max-Age': '86400',
    });
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (!ORIGINS.has(origin)) return reply({ success: false, error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ success: false, error: 'Method not allowed.' }, 405);
    try {
      if (!env.APPS_SCRIPT_URL || !env.RELAY_SECRET || !env.TURNSTILE_SECRET) throw new IntakeError('Intake service is not configured yet. Please email casey@twinlakesweb.com.', 503);
      const path = new URL(request.url).pathname;
      if (path === '/start') {
        const data = JSON.parse(new TextDecoder().decode(await boundedBody(request, 64 * 1024)));
        if (data.company_website) return reply({ success: true, ignored: true });
        if (!UUID.test(data.submissionId)) throw new IntakeError('Invalid submission ID.');
        const fields = {};
        for (const key of FIELDS) {
          if (typeof data.fields?.[key] !== 'string' || data.fields[key].length > 5000) throw new IntakeError('Invalid form field: ' + key);
          fields[key] = data.fields[key].trim();
        }
        for (const key of ['name', 'email', 'business', 'business_description', 'primary_purpose', 'primary_action']) {
          if (!fields[key]) throw new IntakeError('Please complete all required fields.');
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) || /[\r\n]/.test(fields.email)) throw new IntakeError('Please provide a valid email address.');
        if (!Array.isArray(data.files) || data.files.length > MAX_FILES) throw new IntakeError('Attach no more than 10 pictures.');
        const files = data.files.map(file => {
          if (!file || !TYPES.has(file.type) || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES || typeof file.name !== 'string' || file.name.length > 255 || !/^[0-9a-f]{64}$/.test(file.sha256)) throw new IntakeError('Each picture must be a supported image up to 15 MB.');
          return { name: file.name.replace(/[\x00-\x1f/\\]/g, '_'), type: file.type, size: file.size, sha256: file.sha256 };
        });
        if (!(await env.INIT_RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) throw new IntakeError('Please wait a minute before trying again.', 429);
        await verifyHuman(data.turnstileToken, request.headers.get('CF-Connecting-IP'), env);
        const fingerprint = await hash(JSON.stringify({ fields, files }));
        const result = await relay(env, { action: 'start', submissionId: data.submissionId, fingerprint, fields, files });
        const token = await signToken({ submissionId: data.submissionId, fingerprint, files, expires: Date.now() + 24 * 60 * 60 * 1000 }, env.RELAY_SECRET);
        return reply({ success: true, token, completed: result.completed === true });
      }
      if (!['/photo', '/complete'].includes(path)) throw new IntakeError('Not found.', 404);
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      const session = await verifyToken(token, env.RELAY_SECRET);
      if (path === '/photo') {
        const index = Number(request.headers.get('X-Photo-Index'));
        const file = session.files[index];
        if (!Number.isInteger(index) || !file || request.headers.get('X-Photo-Index') === null) throw new IntakeError('Invalid picture index.');
        if (!(await env.UPLOAD_RATE_LIMITER.limit({ key: session.submissionId })).success) throw new IntakeError('Please wait a minute before retrying the upload.', 429);
        const bytes = await boundedBody(request, MAX_FILE_BYTES);
        if (bytes.byteLength !== file.size || await hash(bytes) !== file.sha256 || !matchesImage(bytes, file.type)) throw new IntakeError('The picture does not match the selected file. Please select a valid image.');
        await relay(env, { action: 'photo', submissionId: session.submissionId, fingerprint: session.fingerprint, index, base64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64') });
        return reply({ success: true });
      }
      const result = await relay(env, { action: 'complete', submissionId: session.submissionId, fingerprint: session.fingerprint });
      return reply({ success: true, completed: result.completed === true });
    } catch (error) {
      if (!(error instanceof IntakeError)) console.error(JSON.stringify({ event: 'intake_error', name: error.name }));
      return reply({ success: false, error: error instanceof IntakeError ? error.message : 'The request could not be confirmed. Your progress is saved; please retry.' }, error.status || 502);
    }
  },
};

async function boundedBody(request, max) {
  const declared = request.headers.get('Content-Length');
  if (declared && Number(declared) > max) throw new IntakeError('The upload exceeds the size limit.', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new IntakeError('The upload exceeds the size limit.', 413); }
    chunks.push(value);
  }
  if (chunks.length === 1) return chunks[0];
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function relay(env, data) {
  const response = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, sharedSecret: env.RELAY_SECRET }), signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new IntakeError('The storage service is temporarily unavailable. Please retry.', 502);
  const result = JSON.parse(new TextDecoder().decode(await boundedBody(response, 16 * 1024)));
  if (result.success !== true) throw new IntakeError(result.error || 'Your progress is saved. Please retry.', result.status || 502);
  return result;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function verifyHuman(token, clientIp, env) {
  if (typeof token !== 'string' || !token || token.length > 2048) throw new IntakeError('Please complete the Cloudflare human verification.', 403);
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientIp || '' }),
    });
    if (!response.ok) throw new Error('Verification unavailable');
    result = await response.json();
  } catch { throw new IntakeError('Human verification is temporarily unavailable. Please retry.', 503); }
  if (result.success !== true || result.action !== 'contact' || !['twinlakesweb.com', 'www.twinlakesweb.com'].includes(result.hostname)) throw new IntakeError('Human verification expired or failed. Please verify again.', 403);
}
async function signToken(session, secret) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(payload));
  return payload + '.' + Buffer.from(signature).toString('base64url');
}
async function verifyToken(token, secret) {
  if (!token || token.length > 12000) throw new IntakeError('Please start the request again.', 401);
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !await crypto.subtle.verify('HMAC', await hmacKey(secret), Buffer.from(signature, 'base64url'), new TextEncoder().encode(payload))) throw new IntakeError('Invalid upload session.', 401);
  const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (session.expires < Date.now()) throw new IntakeError('Your upload session expired. Please send the request again.', 401);
  return session;
}
async function hash(value) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value)).toString('hex');
}
function matchesImage(bytes, type) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return Buffer.from(bytes.slice(0, 8)).toString('hex') === '89504e470d0a1a0a';
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
  if (type === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return ascii(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(ascii(8, 40));
}
