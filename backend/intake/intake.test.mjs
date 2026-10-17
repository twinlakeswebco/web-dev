import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import worker, { MAX_FILE_BYTES } from './worker.mjs';

const script = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
const fields = Object.fromEntries(['name', 'email', 'phone', 'business', 'business_description', 'primary_purpose', 'target_audience', 'primary_action', 'pages_needed', 'priority_offering', 'special_features', 'content_status', 'brand_assets', 'inspiration_sites', 'owns_domain', 'existing_web_presence', 'public_contact_info', 'timeline', 'budget', 'reference_links'].map(key => [key, 'Answer for ' + key]));
Object.assign(fields, { name: 'Jane Smith', email: 'jane@example.com', business: 'Sample Business' });
const hash = value => createHash('sha256').update(value).digest('hex');
const iterator = array => { let i = 0; return { hasNext: () => i < array.length, next: () => array[i++] }; };

function harness() {
  class Blob {
    constructor(data, type, name) { this.bytes = Buffer.from(typeof data === 'string' ? data : data || []); this.type = type; this.name = name; }
    getBytes() { return [...this.bytes].map(x => x > 127 ? x - 256 : x); }
    getDataAsString() { return this.bytes.toString(); }
  }
  class SavedFile {
    constructor(name, blob) { this.name = name; this.blob = blob; this.id = randomUUID(); }
    getId() { return this.id; }
    getBlob() { return this.blob; }
    setContent(text) { this.blob = new Blob(text); }
  }
  class Folder {
    constructor(name) { this.name = name; this.description = ''; this.folders = []; this.files = []; this.id = randomUUID(); }
    getName() { return this.name; }
    getDescription() { return this.description; }
    setDescription(description) { this.description = description; }
    getFolders() { return iterator(this.folders); }
    createFolder(name) { const f = new Folder(name); this.folders.push(f); return f; }
    getFilesByName(name) { return iterator(this.files.filter(f => f.name === name)); }
    createFile(name, text, type) { const blob = name instanceof Blob ? name : new Blob(text, type, name); const file = new SavedFile(blob.name, blob); this.files.push(file); return file; }
    getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
  }
  const parent = new Folder('Website Leads'), emails = [], secrets = { RELAY_SECRET: 'test-relay-secret' };
  let locked = false;
  const model = { parent, emails, ambiguousMail: false, quota: 100, action: 'contact', hostname: 'www.twinlakesweb.com', captchaDown: false, rateAllowed: true, usedTokens: new Set(), relayCalls: 0 };
  const context = vm.createContext({
    console: { log() {}, error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => secrets[key], setProperty: (key, value) => { secrets[key] = value; } }) },
    DriveApp: { getFolderById: id => { assert.equal(id, '1Fo5UMBAMnvaQD05kdbmIe9U11JpPZNnZ'); return parent; } },
    MailApp: { getRemainingDailyQuota: () => model.quota, sendEmail: email => { emails.push(email); if (model.ambiguousMail) throw new Error('Send outcome unknown'); } },
    LockService: { getScriptLock: () => ({ tryLock: () => { locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; } }) },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    Utilities: {
      getUuid: randomUUID,
      newBlob: (data, type, name) => new Blob(data, type, name),
      base64Decode: data => [...Buffer.from(data, 'base64')],
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, data) => [...createHash('sha256').update(Buffer.from(data)).digest()],
      formatDate: (date, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  });
  vm.runInContext(script, context);
  globalThis.fetch = async (url, options) => {
    if (url.includes('siteverify')) {
      if (model.captchaDown) throw new Error('Offline');
      const token = options.body.get('response');
      const success = !model.usedTokens.has(token) && token !== 'bad';
      model.usedTokens.add(token);
      return Response.json({ success, action: model.action, hostname: model.hostname });
    }
    model.relayCalls++;
    return new Response(context.doPost({ postData: { contents: options.body } }).text);
  };
  const env = {
    APPS_SCRIPT_URL: 'https://script.google.com/test/exec', RELAY_SECRET: secrets.RELAY_SECRET, TURNSTILE_SECRET: 'test-turnstile-secret',
    INIT_RATE_LIMITER: { limit: async () => ({ success: model.rateAllowed }) },
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: model.rateAllowed }) },
  };
  const call = async (path, data, token, index, origin = 'https://www.twinlakesweb.com', extra = {}) => {
    const headers = { Origin: origin, ...extra };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (index !== undefined) headers['X-Photo-Index'] = String(index);
    const response = await worker.fetch(new Request('https://intake.test' + path, { method: 'POST', headers, body: data instanceof Uint8Array ? data : JSON.stringify(data) }), env);
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const start = (files = [], overrides = {}) => ({ submissionId: randomUUID(), fields: { ...fields }, files, turnstileToken: randomUUID(), ...overrides });
  const picture = (size = 32, name = 'photo.png') => {
    const bytes = Buffer.alloc(size);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
    return { bytes, manifest: { name, size, type: 'image/png', sha256: hash(bytes) } };
  };
  return { model, call, start, picture, context, env };
}

test('zero-picture inquiry: exact parent, folder name, all answers, email, repeat completion', async () => {
  const h = harness(), input = h.start();
  let result = await h.call('/start', input);
  assert.equal(result.status, 200);
  const token = result.data.token;
  result = await h.call('/complete', {}, token);
  assert.equal(result.data.completed, true);
  assert.match(h.model.parent.folders[0].name, /^\d{4}-\d{2}-\d{2}-Jane-Smith-Intake$/);
  const folder = h.model.parent.folders[0];
  const answers = folder.files.find(f => f.name === 'intake.txt').getBlob().getDataAsString();
  for (const value of Object.values(fields)) assert.ok(answers.includes(value));
  assert.equal(h.model.emails[0].to, 'casey@twinlakesweb.com');
  assert.equal(h.model.emails[0].replyTo, 'jane@example.com');
  assert.ok(h.model.emails[0].body.includes(folder.getUrl()));
  assert.equal((await h.call('/complete', {}, token)).data.completed, true);
  result = await h.call('/start', { ...input, turnstileToken: randomUUID() });
  assert.equal(result.data.completed, true);
  assert.equal(h.model.parent.folders.length, 1);
  assert.equal(h.model.emails.length, 1);
});

test('10 pictures of 15 MB each are accepted sequentially; retry does not duplicate', async () => {
  const h = harness(), photo = h.picture(MAX_FILE_BYTES);
  const input = h.start(Array.from({ length: 10 }, (_, i) => ({ ...photo.manifest, name: 'picture-' + i + '.png' })));
  const start = await h.call('/start', input), token = start.data.token;
  assert.equal(start.status, 200);
  assert.equal((await h.call('/complete', {}, token)).status, 409);
  for (let i = 0; i < 10; i++) assert.equal((await h.call('/photo', photo.bytes, token, i)).status, 200);
  assert.equal((await h.call('/photo', photo.bytes, token, 0)).status, 200);
  assert.equal((await h.call('/complete', {}, token)).data.completed, true);
  const stored = h.model.parent.folders[0].files.filter(f => f.name.endsWith('.png'));
  assert.equal(stored.length, 10);
  assert.equal(stored.reduce((size, f) => size + f.blob.bytes.length, 0), 150 * 1024 * 1024);
  assert.equal(h.model.emails.length, 1);
});

test('reject 11 pictures, over 15 MB, invalid type and invalid required fields before Drive', async () => {
  const h = harness(), file = h.picture().manifest;
  for (const input of [h.start(Array(11).fill(file)), h.start([{ ...file, size: MAX_FILE_BYTES + 1 }]), h.start([{ ...file, type: 'text/html' }]), h.start([], { fields: { ...fields, email: 'bad' } }), h.start([], { fields: { ...fields, primary_action: '' } })]) {
    assert.equal((await h.call('/start', input)).status, 400);
  }
  assert.equal(h.model.parent.folders.length, 0);
});

test('Turnstile requires token, expected action and host, and rejects replay; unavailable fails closed', async () => {
  const h = harness();
  assert.equal((await h.call('/start', h.start([], { turnstileToken: '' }))).status, 403);
  assert.equal((await h.call('/start', h.start([], { turnstileToken: 'bad' }))).status, 403);
  h.model.action = 'signup';
  assert.equal((await h.call('/start', h.start())).status, 403);
  h.model.action = 'contact'; h.model.hostname = 'localhost';
  assert.equal((await h.call('/start', h.start())).status, 403);
  h.model.hostname = 'www.twinlakesweb.com'; h.model.captchaDown = true;
  assert.equal((await h.call('/start', h.start())).status, 503);
  assert.equal(h.model.relayCalls, 0);
  h.model.captchaDown = false;
  const input = h.start();
  assert.equal((await h.call('/start', input)).status, 200);
  assert.equal((await h.call('/start', input)).status, 403);
});

test('origin, rate limit, upload token and file integrity are enforced', async () => {
  const h = harness(), photo = h.picture();
  assert.equal((await h.call('/start', h.start(), null, undefined, 'https://evil.test')).status, 403);
  h.model.rateAllowed = false;
  assert.equal((await h.call('/start', h.start())).status, 429);
  h.model.rateAllowed = true;
  const start = await h.call('/start', h.start([photo.manifest])), token = start.data.token;
  assert.equal((await h.call('/photo', photo.bytes, token + 'x', 0)).status, 401);
  assert.equal((await h.call('/photo', photo.bytes, token, 1)).status, 400);
  const changed = Buffer.from(photo.bytes); changed[12] = 1;
  assert.equal((await h.call('/photo', changed, token, 0)).status, 400);
  assert.equal((await h.call('/photo', photo.bytes, token, 0, undefined, { 'Content-Length': String(MAX_FILE_BYTES + 1) })).status, 413);
  assert.equal(h.model.parent.folders[0].files.filter(f => f.name.endsWith('.png')).length, 0);
});

test('same UUID with changed answers conflicts; duplicate start and same filename upload resume', async () => {
  const h = harness(), photo = h.picture(), input = h.start([photo.manifest, photo.manifest]);
  const first = await h.call('/start', input);
  const again = await h.call('/start', { ...input, turnstileToken: randomUUID() });
  assert.equal(again.status, 200);
  assert.equal(h.model.parent.folders.length, 1);
  assert.equal((await h.call('/start', { ...input, turnstileToken: randomUUID(), fields: { ...fields, name: 'Different Person' } })).status, 409);
  for (let i = 0; i < 2; i++) assert.equal((await h.call('/photo', photo.bytes, first.data.token, i)).status, 200);
  assert.equal((await h.call('/complete', {}, again.data.token)).data.completed, true);
  assert.equal(h.model.parent.folders[0].files.filter(f => f.name.endsWith('.png')).length, 2);
});

test('ambiguous email result preserves inquiry and never automatically sends duplicate email', async () => {
  const h = harness(), start = await h.call('/start', h.start());
  h.model.ambiguousMail = true;
  assert.equal((await h.call('/complete', {}, start.data.token)).status, 502);
  assert.equal((await h.call('/complete', {}, start.data.token)).status, 503);
  assert.equal(h.model.emails.length, 1);
  assert.equal(h.model.parent.folders[0].files.some(f => f.name === 'intake.txt'), true);
});
