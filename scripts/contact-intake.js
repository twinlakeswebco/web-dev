(() => {
  'use strict';
  const ENDPOINT = 'https://twinlakes-intake.caseykeown.workers.dev';
  const SITEKEY = '0x4AAAAAAFZYGSB2FG1PLBlM';
  const MAX_FILES = 10, MAX_BYTES = 15 * 1024 * 1024, STORAGE_KEY = 'twinLakesIntakeV2';
  const FIELDS = ['name', 'email', 'phone', 'business', 'business_description', 'primary_purpose', 'target_audience', 'primary_action', 'pages_needed', 'priority_offering', 'special_features', 'content_status', 'brand_assets', 'inspiration_sites', 'owns_domain', 'existing_web_presence', 'public_contact_info', 'timeline', 'budget', 'reference_links'];
  const byId = id => document.getElementById(id);
  const form = byId('lead-form');
  if (!form) return;
  const steps = [...form.querySelectorAll('.form-step')];
  const submit = byId('submit-btn'), photos = byId('photos'), startOver = byId('start-over-btn');
  const selected = [];
  let step = 1, busy = false, widgetId = null, challengeToken = '', session = readSession();
  function status(type, title, message) {
    byId('status-banner').className = 'status-banner visible ' + type;
    byId('status-title').textContent = title;
    byId('status-message').textContent = message;
  }
  function showStep(value) {
    step = Math.max(1, Math.min(steps.length, value));
    steps.forEach((item, index) => item.classList.toggle('active', index === step - 1));
    form.querySelectorAll('.wizard-step-label').forEach((label, index) => {
      label.classList.toggle('active', index === step - 1);
      if (index === step - 1) label.setAttribute('aria-current', 'step');
      else label.removeAttribute('aria-current');
    });
    byId('progress-fill').style.width = (step / steps.length * 100) + '%';
    steps[step - 1].querySelector('.step-heading').focus({ preventScroll: true });
    document.querySelector('.wizard-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (step === 3) loadTurnstile();
  }
  function validate(section) {
    const invalid = section.querySelector(':invalid');
    if (!invalid) return true;
    showStep(Number(invalid.closest('.form-step').dataset.step));
    invalid.reportValidity();
    return false;
  }
  form.querySelectorAll('.next-step').forEach(button => button.addEventListener('click', () => { if (validate(steps[step - 1])) showStep(step + 1); }));
  form.querySelectorAll('.prev-step').forEach(button => button.addEventListener('click', () => showStep(step - 1)));
  function loadTurnstile() {
    if (byId('turnstile-api')) return;
    window.onIntakeTurnstileReady = () => {
      widgetId = window.turnstile.render('#turnstile-widget', {
        sitekey: SITEKEY, action: 'contact', theme: 'light', size: 'flexible',
        callback: token => { challengeToken = token; },
        'expired-callback': () => { challengeToken = ''; },
        'error-callback': () => {
          challengeToken = '';
          status('error', 'VERIFICATION UNAVAILABLE', 'Cloudflare verification could not load. Please retry or email casey@twinlakesweb.com.');
        },
      });
    };
    const script = document.createElement('script');
    script.id = 'turnstile-api';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onIntakeTurnstileReady&render=explicit';
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      script.remove();
      status('error', 'VERIFICATION UNAVAILABLE', 'Check your connection or allow challenges.cloudflare.com, then return to this step.');
    };
    document.head.appendChild(script);
  }
  function resetChallenge() {
    challengeToken = '';
    if (widgetId !== null) window.turnstile?.reset(widgetId);
  }
  function imageType(file) {
    return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' })[file.name.split('.').pop().toLowerCase()] || '';
  }
  photos.addEventListener('change', () => {
    if (busy) return;
    const errors = [];
    for (const file of photos.files) {
      if (!imageType(file)) errors.push(file.name + ': choose a JPG, PNG, WebP, GIF, HEIC, or HEIF picture.');
      else if (!file.size || file.size > MAX_BYTES) errors.push(file.name + ': each picture must be between 1 byte and 15 MB.');
      else if (selected.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) continue;
      else if (selected.length === MAX_FILES) errors.push('You can add up to 10 pictures. Remove one before adding another.');
      else selected.push(file);
    }
    photos.value = '';
    byId('photo-error').textContent = [...new Set(errors)].join(' ');
    renderFiles();
  });
  function renderFiles() {
    const list = byId('photo-list');
    list.replaceChildren();
    selected.forEach((file, index) => {
      const item = document.createElement('li'), text = document.createElement('span'), remove = document.createElement('button');
      text.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.disabled = busy;
      remove.setAttribute('aria-label', 'Remove ' + file.name);
      remove.addEventListener('click', () => { if (!busy) { selected.splice(index, 1); renderFiles(); } });
      item.append(text, remove);
      list.appendChild(item);
    });
    byId('photo-count').textContent = selected.length + ' of 10 pictures selected';
  }
  function readSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      return saved?.id && Date.now() - saved.startedAt < 24 * 60 * 60 * 1000 ? saved : null;
    } catch { return null; }
  }
  function saveSession() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* In-page retries still work. */ }
  }
  startOver.addEventListener('click', () => {
    if (busy) return;
    session = null;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
    startOver.hidden = true;
    submit.disabled = false;
    submit.textContent = 'Send my request';
    status('success', 'NEW REQUEST', 'You can edit your answers and select pictures for a new inquiry.');
    resetChallenge();
  });
  if (session) {
    startOver.hidden = false;
    if (session.completed) {
      submit.disabled = true;
      submit.textContent = 'Request received';
      status('success', 'REQUEST RECEIVED', 'Your inquiry was received. Casey will respond within one business day.');
    } else status('error', 'UNFINISHED REQUEST', 'Your progress is saved. Re-enter the same answers and select the same pictures to resume, or start a new request.');
  }
  async function sha256(value) {
    const hash = await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function request(path, body, token, index) {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (index !== undefined) headers['X-Photo-Index'] = String(index);
    if (!(body instanceof File)) headers['Content-Type'] = 'application/json';
    const response = await fetch(ENDPOINT + path, {
      method: 'POST', headers, body: body instanceof File ? body : JSON.stringify(body), signal: AbortSignal.timeout(120000),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error(result.error || 'Your request could not be confirmed. Please retry.');
    return result;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || session?.completed || !validate(form)) return;
    if (byId('company_website').value.trim()) { status('success', 'REQUEST RECEIVED', 'Thank you. Your request has been received.'); return; }
    if (!challengeToken) {
      showStep(3);
      status('error', 'HUMAN VERIFICATION REQUIRED', 'Please complete the Cloudflare verification before sending your inquiry.');
      return;
    }
    busy = true;
    const controls = [...form.querySelectorAll('input, textarea, select, button')];
    const disabledBefore = controls.map(control => control.disabled), formData = new FormData(form);
    controls.forEach(control => { control.disabled = true; });
    renderFiles();
    submit.textContent = 'Preparing pictures...';
    try {
      const fields = Object.fromEntries(FIELDS.map(key => [key, String(formData.get(key) || '').trim()]));
      const files = [];
      for (let index = 0; index < selected.length; index++) {
        status('success', 'PREPARING PICTURES', 'Checking picture ' + (index + 1) + ' of ' + selected.length + '. Please keep this page open.');
        const file = selected[index];
        files.push({ name: file.name, type: imageType(file), size: file.size, sha256: await sha256(await file.arrayBuffer()) });
      }
      const fingerprint = await sha256(JSON.stringify({ fields, files }));
      if (session && session.fingerprint !== fingerprint) throw new Error('This unfinished request has different answers or pictures. Restore your original selection, or choose Start a new request.');
      session ||= { id: crypto.randomUUID(), startedAt: Date.now(), fingerprint, completed: false };
      saveSession();
      submit.textContent = 'Sending inquiry...';
      const result = await request('/start', { submissionId: session.id, fields, files, turnstileToken: challengeToken, company_website: '' });
      if (!result.completed) {
        for (let index = 0; index < selected.length; index++) {
          submit.textContent = 'Uploading ' + (index + 1) + ' of ' + selected.length + '...';
          status('success', 'UPLOADING PICTURES', 'Picture ' + (index + 1) + ' of ' + selected.length + '. Please keep this page open.');
          await request('/photo', selected[index], result.token, index);
        }
        submit.textContent = 'Finishing...';
        const completed = await request('/complete', {}, result.token);
        if (!completed.completed) throw new Error('Your request is saved but has not finished. Please retry.');
      }
      session.completed = true;
      saveSession();
      form.reset();
      selected.length = 0;
      status('success', 'REQUEST RECEIVED', 'Your inquiry and pictures were received. Casey will respond within one business day.');
      submit.textContent = 'Request received';
    } catch (error) {
      status('error', 'REQUEST NOT CONFIRMED', error.message === 'Failed to fetch' || error.name === 'TimeoutError' ? 'Your connection was interrupted. Keep this page open, verify again, and retry to resume the same request.' : error.message);
      submit.textContent = 'Retry my request';
    } finally {
      busy = false;
      controls.forEach((control, index) => { control.disabled = disabledBefore[index]; });
      submit.disabled = session?.completed === true;
      startOver.hidden = !session;
      renderFiles();
      resetChallenge();
    }
  });
})();
