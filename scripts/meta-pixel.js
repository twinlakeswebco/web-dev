const pixelId = "1396966225572374";
const preferenceKey = "twinlakes-meta-ads";
const footer = document.querySelector(".footer-bottom");

if (footer && navigator.globalPrivacyControl !== true) {
  setupAdPreferences();
}

function setupAdPreferences() {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/css/ad-preferences.css";
  document.head.append(stylesheet);

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "ad-preferences-link";
  settings.textContent = "Ad privacy settings";
  settings.setAttribute("aria-controls", "ad-preferences");
  footer.append(settings);

  const panel = document.createElement("section");
  panel.id = "ad-preferences";
  panel.className = "ad-preferences";
  panel.setAttribute("aria-labelledby", "ad-preferences-title");
  panel.hidden = true;
  panel.innerHTML = `
    <h2 id="ad-preferences-title" tabindex="-1">Ad privacy</h2>
    <p>If you allow ad tracking, Meta can use cookies and the Meta Pixel to measure visits and completed quote requests and to show relevant ads. You can change your choice in the footer.</p>
    <div class="ad-preferences-actions">
      <button type="button" data-choice="declined">Decline ad tracking</button>
      <button type="button" data-choice="allowed">Allow ad tracking</button>
    </div>
    <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">Meta Privacy Policy</a>
  `;
  document.body.append(panel);

  let preference;
  try {
    preference = window.localStorage.getItem(preferenceKey);
  } catch {
    // A choice still applies for the current page when storage is unavailable.
  }
  let pixelStarted = false;
  let openedFromFooter = false;

  function startPixel() {
    if (pixelStarted) {
      window.fbq("consent", "grant");
      return;
    }
    if (!window.fbq) {
      const queue = function () {
        if (queue.callMethod) {
          queue.callMethod.apply(queue, arguments);
        } else {
          queue.queue.push(arguments);
        }
      };
      window.fbq = queue;
      window._fbq ||= queue;
      queue.push = queue;
      queue.loaded = true;
      queue.version = "2.0";
      queue.queue = [];

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.append(script);
    }
    window.fbq("set", "autoConfig", false, pixelId);
    window.fbq("init", pixelId);
    window.fbq("trackSingle", pixelId, "PageView");
    pixelStarted = true;
  }

  settings.addEventListener("click", () => {
    openedFromFooter = true;
    panel.hidden = false;
    panel.querySelector("h2").focus();
  });

  panel.addEventListener("click", (event) => {
    const choice = event.target.closest("button[data-choice]");
    if (!choice) return;
    preference = choice.dataset.choice;
    try {
      window.localStorage.setItem(preferenceKey, preference);
    } catch {
      // The choice remains in effect for the current page.
    }
    if (preference === "allowed") {
      startPixel();
    } else if (pixelStarted) {
      window.fbq("consent", "revoke");
      for (const name of ["_fbp", "_fbc"]) {
        document.cookie = name + "=; Max-Age=0; Path=/; Secure";
        document.cookie = name + "=; Max-Age=0; Path=/; Domain=twinlakesweb.com; Secure";
      }
    }
    panel.hidden = true;
    if (openedFromFooter) settings.focus();
    openedFromFooter = false;
  });

  window.addEventListener("twinlakes:inquiry-submitted", () => {
    if (preference === "allowed" && pixelStarted) {
      window.fbq("trackSingle", pixelId, "Lead");
    }
  });

  if (preference === "allowed") {
    startPixel();
  } else if (preference !== "declined") {
    panel.hidden = false;
  }
}
