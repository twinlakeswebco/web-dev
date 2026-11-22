// No article text or Stripe API key is bundled in the public repository.
const BASE = '/api/reader';
export const SLUG = 'twin-lakes-owensboro-health-surplus-staffing-investigation';
const ORIGIN = 'https://www.twinlakesweb.com';
const ARTICLE = `${ORIGIN}/blog/articles/${SLUG}/`;
const COOKIE = '__Host-twinlakes-reader';
const YEAR = 365 * 86400;
const now = () => Math.floor(Date.now() / 1000);
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
export async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
function cookie(request) {
  return request.headers.get('Cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
function setCookie(token) { return `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${YEAR}`; }
function response(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers } });
}
async function json(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid request.');
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 65536) { await reader.cancel(); throw new Error('Request too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
export async function verifySignature(raw, header, secret, timestamp = now()) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(x => x.trim().split('='));
  const t = parts.find(x => x[0] === 't')?.[1];
  if (!/^\d+$/.test(t || '') || Math.abs(timestamp - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const [, value] of parts.filter(x => x[0] === 'v1')) {
    if (!/^[a-f0-9]{64}$/.test(value || '')) continue;
    const signature = Uint8Array.from(value.match(/../g), x => parseInt(x, 16));
    if (await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(`${t}.${raw}`))) return true;
  }
  return false;
}
async function limit(db, key, maximum, seconds) {
  const result = await db.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`)
    .bind(key, now() + seconds, now(), now()).first();
  return result.count <= maximum;
}
async function owned(db, sessionHash) {
  if (!sessionHash) return null;
  return db.prepare(`SELECT p.id FROM purchases p JOIN access_grants a ON a.purchase_id=p.id
    WHERE a.session_hash=? AND a.expires_at>? AND p.slug=?
    AND NOT EXISTS(SELECT 1 FROM payment_blocks b WHERE b.payment_intent=p.payment_intent) LIMIT 1`)
    .bind(sessionHash, now(), SLUG).first();
}
function ready(env) {
  return env.ENABLED === 'true' && env.DB && env.STRIPE_WEBHOOK_SECRET &&
    /^plink_/.test(env.PAYMENT_LINK_ID || '') && /^https:\/\/buy\.stripe\.com\//.test(env.PAYMENT_LINK_URL || '') &&
    env.EMAIL_ENABLED === 'true' && (env.EMAIL || env.RESEND_API_KEY);
}
export async function processEvent(event, env) {
  if (event.livemode !== (env.STRIPE_LIVE !== 'false')) throw new Error('Wrong Stripe mode.');
  const db = env.DB; const object = event.data?.object;
  if (!object || !event.id) throw new Error('Invalid event.');
  const seen = await db.prepare('SELECT id FROM webhook_events WHERE id=?').bind(event.id).first();
  if (seen) return;
  const statements = [];
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    if (object.payment_link !== env.PAYMENT_LINK_ID) return;
    if (object.payment_status !== 'paid') return;
    if (object.mode !== 'payment' || object.currency !== 'usd' || object.amount_subtotal !== 135 || object.amount_total !== 135) throw new Error('Unexpected purchase.');
    const email = object.customer_details?.email?.trim().toLowerCase();
    if (!email || !object.payment_intent || !object.id) throw new Error('Missing payment identity.');
    statements.push(db.prepare('INSERT OR IGNORE INTO purchases(id,email,payment_intent,slug,created_at) VALUES(?,?,?,?,?)')
      .bind(object.id, email, object.payment_intent, SLUG, now()));
    const attempt = await db.prepare('SELECT session_hash FROM checkout_attempts WHERE ref=? AND expires_at>?')
      .bind(object.client_reference_id || '', now()).first();
    if (attempt) statements.push(db.prepare('INSERT OR IGNORE INTO access_grants(session_hash,purchase_id,expires_at) VALUES(?,?,?)')
      .bind(attempt.session_hash, object.id, now() + YEAR));
  } else if (event.type === 'charge.dispute.created' || (event.type === 'charge.refunded' && object.refunded === true)) {
    // Blocks also survive out-of-order delivery before checkout completion.
    if (object.payment_intent) statements.push(db.prepare('INSERT OR IGNORE INTO payment_blocks(payment_intent) VALUES(?)').bind(object.payment_intent));
  }
  statements.push(db.prepare('INSERT OR IGNORE INTO webhook_events(id,created_at) VALUES(?,?)').bind(event.id, now()));
  await db.batch(statements);
}
async function sendRestore(env, email, token) {
  const url = `${ARTICLE}#restore=${token}`;
  const message = { from: env.EMAIL_FROM || 'Twin Lakes Web Co. <reader@twinlakesweb.com>', to: [email],
    subject: 'Your Twin Lakes Web Co. article access',
    text: `Use this link to restore your purchased article on this device:\n\n${url}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.` };
  if (env.EMAIL) return env.EMAIL.send(message);
  const result = await fetch('https://api.resend.com/emails', { method: 'POST', headers: {
    Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(message) });
  if (!result.ok) throw new Error('Email delivery failed.');
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url); const path = url.pathname;
    try {
      if (path === `${BASE}/webhook` && request.method === 'POST') {
        if (!env.DB || !env.STRIPE_WEBHOOK_SECRET) return response({ error: 'Not configured.' }, 503);
        const raw = await json(request);
        if (!await verifySignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET)) return response({ error: 'Invalid signature.' }, 400);
        await processEvent(JSON.parse(raw), env);
        return response({ received: true });
      }
      if (!path.startsWith(`${BASE}/`)) return response({ error: 'Not found.' }, 404);
      if (request.method !== 'GET' && request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
      if (request.method === 'POST' && request.headers.get('Origin') !== ORIGIN) return response({ error: 'Origin not allowed.' }, 403);
      if (!env.DB) return response({ error: 'Article access is being set up. Please try again later.' }, 503);
      const token = cookie(request); const sessionHash = /^[a-f0-9]{64}$/.test(token || '') ? await hash(token) : null;
      if (path === `${BASE}/status` && request.method === 'GET') return response({ purchased: Boolean(await owned(env.DB, sessionHash)), checkoutEnabled: Boolean(ready(env)) });
      if (path === `${BASE}/content` && request.method === 'GET') {
        if (!await owned(env.DB, sessionHash)) return response({ error: 'Purchase required.' }, 401);
        const article = await env.DB.prepare('SELECT html FROM articles WHERE slug=?').bind(SLUG).first();
        return article ? response({ html: article.html }) : response({ error: 'Article temporarily unavailable.' }, 503);
      }
      if (request.method !== 'POST') return response({ error: 'Not found.' }, 404);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (!await limit(env.DB, `ip:${await hash(ip)}:${path}`, 15, 600)) return response({ error: 'Too many attempts. Please try again later.' }, 429);
      if (path === `${BASE}/checkout`) {
        if (!ready(env)) return response({ error: 'Purchases are not available yet. Please try again later.' }, 503);
        if (await owned(env.DB, sessionHash)) return response({ purchased: true });
        if (!await env.DB.prepare('SELECT slug FROM articles WHERE slug=?').bind(SLUG).first()) return response({ error: 'Article unavailable.' }, 503);
        const session = sessionHash ? token : random(); const ref = random();
        await env.DB.prepare('INSERT INTO checkout_attempts(ref,session_hash,expires_at) VALUES(?,?,?)').bind(ref, await hash(session), now() + 86400).run();
        const checkout = new URL(env.PAYMENT_LINK_URL); checkout.searchParams.set('client_reference_id', ref);
        return response({ url: checkout.href }, 200, { 'Set-Cookie': setCookie(session) });
      }
      if (path === `${BASE}/recover`) {
        if (env.EMAIL_ENABLED !== 'true' || (!env.EMAIL && !env.RESEND_API_KEY)) return response({ error: 'Email access is temporarily unavailable. Contact casey@twinlakesweb.com.' }, 503);
        const data = JSON.parse(await json(request)); const email = String(data.email || '').trim().toLowerCase();
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: 'Enter a valid email address.' }, 400);
        const allowed = await limit(env.DB, `email:${await hash(email)}`, 3, 3600);
        const purchase = await env.DB.prepare(`SELECT id FROM purchases p WHERE email=? AND slug=? AND NOT EXISTS(SELECT 1 FROM payment_blocks b WHERE b.payment_intent=p.payment_intent) LIMIT 1`).bind(email, SLUG).first();
        if (allowed && purchase) {
          const restore = random(); const digest = await hash(restore);
          await env.DB.prepare('INSERT INTO restore_tokens(token_hash,email,slug,expires_at) VALUES(?,?,?,?)').bind(digest, email, SLUG, now() + 900).run();
          try { await sendRestore(env, email, restore); } catch {
            await env.DB.prepare('DELETE FROM restore_tokens WHERE token_hash=?').bind(digest).run();
            return response({ error: 'Email delivery is temporarily unavailable. Please try again later.' }, 503);
          }
        }
        return response({ message: 'If that email has a purchase, an access link will arrive shortly. Check your spam folder too.' });
      }
      if (path === `${BASE}/restore`) {
        const data = JSON.parse(await json(request));
        if (!/^[a-f0-9]{64}$/.test(data.token || '')) return response({ error: 'Invalid access link.' }, 400);
        const restored = await env.DB.prepare('UPDATE restore_tokens SET used=1 WHERE token_hash=? AND used=0 AND expires_at>? AND slug=? RETURNING email').bind(await hash(data.token), now(), SLUG).first();
        if (!restored) return response({ error: 'This access link expired or was already used. Request a new one.' }, 400);
        const session = random();
        await env.DB.prepare(`INSERT INTO access_grants(session_hash,purchase_id,expires_at)
          SELECT ?,id,? FROM purchases p WHERE email=? AND slug=? AND NOT EXISTS(SELECT 1 FROM payment_blocks b WHERE b.payment_intent=p.payment_intent)`)
          .bind(await hash(session), now() + YEAR, restored.email, SLUG).run();
        return response({ restored: true }, 200, { 'Set-Cookie': setCookie(session) });
      }
      return response({ error: 'Not found.' }, 404);
    } catch (error) {
      // Never log webhook bodies, customer emails, tokens, or content.
      console.error('Reader request failed', error instanceof SyntaxError ? 'invalid-json' : 'processing-error');
      return response({ error: 'Unable to complete this request. Please try again.' }, error instanceof SyntaxError ? 400 : 500);
    }
  },
  async scheduled(_event, env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM checkout_attempts WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM restore_tokens WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM access_grants WHERE expires_at<?').bind(now()),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now())
    ]);
  }
};
