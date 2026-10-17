// Load the self-hosted viewer and GLB only after an explicit request.
const workspace = document.querySelector('[data-workspace]');

if (workspace) {
  const stage = workspace.querySelector('[data-workspace-stage]');
  const poster = workspace.querySelector('[data-workspace-poster]');
  const toggle = workspace.querySelector('[data-workspace-toggle]');
  const status = workspace.querySelector('[data-workspace-status]');
  let viewer;
  let timeout;

  const showStill = () => {
    clearTimeout(timeout);
    viewer?.remove();
    viewer = undefined;
    poster.hidden = false;
    toggle.disabled = false;
    toggle.setAttribute('aria-expanded', 'false');
    stage.removeAttribute('aria-busy');
    toggle.textContent = 'Explore in 3D';
  };

  const showError = () => {
    showStill();
    toggle.textContent = 'Try 3D again';
    status.textContent = 'The 3D view could not load. You can try again or enjoy the still preview.';
  };

  toggle.hidden = false;
  toggle.addEventListener('click', async () => {
    if (viewer) {
      showStill();
      status.textContent = 'A little Twin Lakes workspace.';
      return;
    }

    toggle.disabled = true;
    toggle.textContent = 'Loading 3D…';
    stage.setAttribute('aria-busy', 'true');
    status.textContent = 'Opening the workspace. The still preview stays visible while it loads.';
    // Invalidate a late import if the connection times out.
    let expired = false;
    timeout = setTimeout(() => { expired = true; showError(); }, 20000);

    try {
      await import('/scripts/vendor/model-viewer-4.1.0.min.js');
      if (expired) return;
      viewer = document.createElement('model-viewer');
      const currentViewer = viewer;
      const attributes = {
        src: '/assets/models/twin-lakes-web-co.glb',
        alt: 'Interactive miniature Twin Lakes Web Co. workspace. Use arrow keys or drag to turn the view.',
        'camera-controls': '',
        'camera-orbit': '25deg 75deg auto',
        'field-of-view': '30deg',
        'min-camera-orbit': 'auto 35deg auto',
        'max-camera-orbit': 'auto 90deg auto',
        'shadow-intensity': '1',
        exposure: '1.2',
        'disable-zoom': '',
        'disable-pan': '',
        'touch-action': 'pan-y',
        'interaction-prompt': 'none',
        'interpolation-decay': matchMedia('(prefers-reduced-motion: reduce)').matches ? '0' : '100',
      };
      for (const [name, value] of Object.entries(attributes)) viewer.setAttribute(name, value);
      // Keep the poster in front until the first model frame is ready.
      viewer.style.visibility = 'hidden';
      viewer.addEventListener('load', () => {
        if (viewer !== currentViewer) return;
        clearTimeout(timeout);
        viewer.style.visibility = '';
        poster.hidden = true;
        stage.removeAttribute('aria-busy');
        toggle.disabled = false;
        toggle.textContent = 'Close 3D view';
        toggle.setAttribute('aria-expanded', 'true');
        status.textContent = 'Drag left or right to explore. Use arrow keys when the model is focused.';
        viewer.focus();
      }, { once: true });
      viewer.addEventListener('error', () => {
        if (viewer === currentViewer) showError();
      }, { once: true });
      stage.append(viewer);
    } catch {
      if (!expired) showError();
    }
  });
}
