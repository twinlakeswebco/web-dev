(() => {
  const root = document.querySelector('[data-reader]');
  if (!root) return;
  const status = root.querySelector('[data-reader-status]');
  const buy = root.querySelector('[data-reader-buy]');
  const recover = root.querySelector('[data-reader-recover]');
  const restoreButton = root.querySelector('[data-reader-restore]');
  const message = text => { status.textContent = text; };
  async function api(path, data) {
    const result = await fetch(`/api/reader/${path}`, { method: data ? 'POST' : 'GET',
      credentials: 'same-origin', cache: 'no-store',
      headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
    if (!result.headers.get('Content-Type')?.includes('application/json')) throw new Error('Article access is being set up. Please try again later.');
    const body = await result.json();
    if (!result.ok) throw new Error(body.error || 'Please try again.');
    return body;
  }
  async function unlock() {
    const data = await api('content');
    // Trusted HTML rendered from the author's Markdown and served only after authorization.
    document.getElementById('paid-content').innerHTML = data.html;
    root.hidden = true;
    document.querySelector('[data-reader-preview]').hidden = true;
    document.getElementById('paid-content').hidden = false;
    document.getElementById('paid-content').focus();
  }
  async function check() {
    const data = await api('status');
    if (data.purchased) { await unlock(); return true; }
    buy.disabled = !data.checkoutEnabled;
    if (!data.checkoutEnabled) message('Purchases are being set up. Please check back shortly.');
    return false;
  }
  buy.addEventListener('click', async () => {
    buy.disabled = true; message('Opening secure checkout…');
    try {
      const data = await api('checkout', {});
      if (data.purchased) return await unlock();
      const url = new URL(data.url);
      if (url.origin !== 'https://buy.stripe.com') throw new Error('Invalid checkout destination.');
      location.assign(url.href);
    } catch (error) { message(error.message); buy.disabled = false; }
  });
  recover.addEventListener('submit', async event => {
    event.preventDefault(); const button = recover.querySelector('button'); button.disabled = true;
    message('Looking up your purchase…');
    try { const data = await api('recover', { email: new FormData(recover).get('email') }); message(data.message); }
    catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
  const restoreToken = new URLSearchParams(location.hash.slice(1)).get('restore');
  if (restoreToken) {
    history.replaceState(null, '', location.pathname + location.search);
    restoreButton.hidden = false; message('Select Restore access to open your purchased article on this device.');
    restoreButton.addEventListener('click', async () => {
      restoreButton.disabled = true;
      try { await api('restore', { token: restoreToken }); await unlock(); }
      catch (error) { message(error.message); restoreButton.disabled = false; }
    });
  }
  (async () => {
    try {
      if (await check()) return;
      if (new URLSearchParams(location.search).get('payment') !== 'complete') return;
      history.replaceState(null, '', location.pathname);
      message('Confirming your payment…');
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (await check()) return;
      }
      message('Payment confirmation is taking longer than expected. Refresh this page or use your checkout email below to restore access.');
    } catch (error) { message(error.message); }
  })();
})();
