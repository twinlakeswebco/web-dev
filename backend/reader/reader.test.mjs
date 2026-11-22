import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import worker, { SLUG, hash, processEvent, verifySignature } from './worker.mjs';
const origin = 'https://www.twinlakesweb.com';
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const adapter = { prepare(sql) { const stmt = sqlite.prepare(sql); let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return stmt.get(...args) || null; },
      async run() { return stmt.run(...args); }, execute() { return stmt.run(...args); } }; },
    async batch(statements) { sqlite.exec('BEGIN'); try { const result=statements.map(s=>s.execute()); sqlite.exec('COMMIT'); return result; } catch(e) { sqlite.exec('ROLLBACK'); throw e; } } };
  const emails = [];
  const env = { DB: adapter, STRIPE_LIVE: 'false', STRIPE_WEBHOOK_SECRET: 'whsec_testing', ENABLED: 'true', EMAIL_ENABLED: 'true',
    EMAIL: { async send(message) { emails.push(message); } }, PAYMENT_LINK_ID: 'plink_testing', PAYMENT_LINK_URL: 'https://buy.stripe.com/example' };
  sqlite.prepare('INSERT INTO articles(slug,html) VALUES(?,?)').run(SLUG, '<h2>Private report</h2><p>Protected text.</p>');
  async function request(path, { method='GET', body, cookie, requestOrigin=origin }={}) {
    const headers = { Origin: requestOrigin, 'CF-Connecting-IP': '192.0.2.1' };
    if (cookie) headers.Cookie = cookie;
    return worker.fetch(new Request(`${origin}/api/reader/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  }
  return { env, sqlite, emails, request };
}
async function checkout(ctx) {
  const r = await ctx.request('checkout', { method:'POST', body:{} }); assert.equal(r.status, 200);
  const cookie = r.headers.get('Set-Cookie').split(';')[0]; const data = await r.json();
  const ref = new URL(data.url).searchParams.get('client_reference_id');
  return { cookie, ref };
}
function paid(ref, overrides={}) {
  return { id:'evt_paid', livemode:false, type:'checkout.session.completed', data:{ object:{ id:'cs_purchase', mode:'payment',
    payment_status:'paid', payment_link:'plink_testing', amount_subtotal:135, amount_total:135, currency:'usd',
    payment_intent:'pi_purchase', client_reference_id:ref, customer_details:{ email:'reader@example.com' }, ...overrides } } };
}
test('unpaid visitors cannot retrieve content or forge access with a success URL', async () => {
  const c=setup(); for (const path of ['content','content?payment=complete&session_id=cs_purchase']) assert.equal((await c.request(path)).status,401);
  assert.equal((await c.request('content', {cookie:'__Host-twinlakes-reader='+'a'.repeat(64)})).status,401);
});
test('checkout sets a secure HttpOnly cookie and server-generated payment reference', async()=>{
  const c=setup(); const r=await c.request('checkout',{method:'POST',body:{amount:1}});
  assert.match(r.headers.get('Set-Cookie'),/Secure; HttpOnly; SameSite=Lax/);
  const d=await r.json(); assert.match(new URL(d.url).searchParams.get('client_reference_id'),/^[a-f0-9]{64}$/);
});
test('cross-origin checkout and recovery are blocked',async()=>{
  const c=setup(); for(const path of ['checkout','recover','restore']) assert.equal((await c.request(path,{method:'POST',body:{},requestOrigin:'https://evil.example'})).status,403);
});
test('checkout remains disabled until payment and email delivery are configured',async()=>{
  const c=setup(); c.env.EMAIL_ENABLED='false'; assert.equal((await c.request('checkout',{method:'POST',body:{}})).status,503);
  assert.equal((await (await c.request('status')).json()).checkoutEnabled,false);
});
test('valid payment grants access only to the purchasing browser; duplicate event is safe',async()=>{
  const c=setup(); const {cookie,ref}=await checkout(c); const event=paid(ref);
  await processEvent(event,c.env); await processEvent(event,c.env);
  assert.equal(c.sqlite.prepare('SELECT count(*) n FROM purchases').get().n,1);
  assert.equal((await c.request('content',{cookie})).status,200);
  assert.equal((await c.request('content')).status,401);
  assert.match((await c.request('content',{cookie})).headers.get('Cache-Control'),/no-store/);
});
test('unpaid and unrelated checkout sessions never grant access',async()=>{
  for(const overrides of [{payment_status:'unpaid'},{payment_link:'plink_other'}]) {
    const c=setup(); const {cookie,ref}=await checkout(c); await processEvent(paid(ref,overrides),c.env);
    assert.equal((await c.request('content',{cookie})).status,401);
  }
});
test('wrong amount, currency and Stripe mode are rejected',async()=>{
  for(const overrides of [{amount_subtotal:100},{currency:'eur'}]) {
    const c=setup(); const {ref}=await checkout(c); await assert.rejects(processEvent(paid(ref,overrides),c.env));
  }
  const c=setup(); const e=paid(''); e.livemode=true; await assert.rejects(processEvent(e,c.env));
});
test('refunds revoke existing access and out-of-order refunds cannot be undone by checkout',async()=>{
  for(const before of [true,false]) {
    const c=setup(); const {cookie,ref}=await checkout(c);
    const refund={id:'evt_refund',livemode:false,type:'charge.refunded',data:{object:{payment_intent:'pi_purchase',refunded:true}}};
    if(before) await processEvent(refund,c.env);
    await processEvent(paid(ref),c.env);
    if(!before) await processEvent(refund,c.env);
    assert.equal((await c.request('content',{cookie})).status,401);
  }
});
test('disputes block access even before checkout completion',async()=>{
  const c=setup(); const {cookie,ref}=await checkout(c);
  await processEvent({id:'evt_dispute',livemode:false,type:'charge.dispute.created',data:{object:{payment_intent:'pi_purchase'}}},c.env);
  await processEvent(paid(ref),c.env); assert.equal((await c.request('content',{cookie})).status,401);
});
test('email restoration grants a new session and the token cannot be replayed',async()=>{
  const c=setup(); const {ref}=await checkout(c); await processEvent(paid(ref),c.env);
  const r=await c.request('recover',{method:'POST',body:{email:'Reader@Example.com'}}); assert.equal(r.status,200); assert.equal(c.emails.length,1);
  const token=c.emails[0].text.match(/#restore=([a-f0-9]{64})/)[1];
  const restored=await c.request('restore',{method:'POST',body:{token}}); assert.equal(restored.status,200);
  const cookie=restored.headers.get('Set-Cookie').split(';')[0]; assert.equal((await c.request('content',{cookie})).status,200);
  assert.equal((await c.request('restore',{method:'POST',body:{token}})).status,400);
});
test('expired restore links are rejected',async()=>{
  const c=setup(); const token='a'.repeat(64);
  c.sqlite.prepare('INSERT INTO restore_tokens(token_hash,email,slug,expires_at) VALUES(?,?,?,?)').run(await hash(token),'reader@example.com',SLUG,1);
  assert.equal((await c.request('restore',{method:'POST',body:{token}})).status,400);
});
test('recovery does not disclose whether an email has purchased',async()=>{
  const c=setup(); const {ref}=await checkout(c); await processEvent(paid(ref),c.env);
  const known=await (await c.request('recover',{method:'POST',body:{email:'reader@example.com'}})).json();
  const unknown=await (await c.request('recover',{method:'POST',body:{email:'unknown@example.com'}})).json(); assert.deepEqual(known,unknown);
});
test('signature verification rejects tampering, stale timestamps and missing secrets',async()=>{
  const raw=JSON.stringify(paid('')); const t=Math.floor(Date.now()/1000);
  const signature=createHmac('sha256','whsec_testing').update(`${t}.${raw}`).digest('hex');
  assert.equal(await verifySignature(raw,`t=${t},v1=${signature}`,'whsec_testing'),true);
  assert.equal(await verifySignature(raw+' ',`t=${t},v1=${signature}`,'whsec_testing'),false);
  assert.equal(await verifySignature(raw,`t=${t},v1=${signature}`,'whsec_testing',t+301),false);
  assert.equal(await verifySignature(raw,`t=${t},v1=${signature}`,undefined),false);
});
test('webhook endpoint rejects unsigned payloads',async()=>{
  const c=setup(); assert.equal((await c.request('webhook',{method:'POST',body:paid('')})).status,400);
});
test('checkout rate limit prevents repeated attempts',async()=>{
  const c=setup(); for(let i=0;i<15;i++) assert.equal((await c.request('checkout',{method:'POST',body:{}})).status,200);
  assert.equal((await c.request('checkout',{method:'POST',body:{}})).status,429);
});
