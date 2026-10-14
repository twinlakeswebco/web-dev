(() => {
  "use strict";

  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const navToggle = document.querySelector("[data-nav-toggle]");
  const navLinks = document.querySelector("[data-nav-links]");

  if (navToggle && navLinks) {
    const mobileViewport = window.matchMedia("(max-width: 62rem)");
    const setMenu = (open) => {
      open = open && mobileViewport.matches;
      navToggle.setAttribute("aria-expanded", String(open));
      navLinks.dataset.open = String(open);
      document.body.classList.toggle("nav-open", open);
      navToggle.querySelector(".sr-only").textContent = open ? "Close menu" : "Open menu";
    };

    navToggle.addEventListener("click", () => {
      setMenu(navToggle.getAttribute("aria-expanded") !== "true");
    });

    navLinks.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && navToggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        navToggle.focus();
      }
    });

    mobileViewport.addEventListener("change", () => setMenu(false));

    navLinks.addEventListener("focusout", (event) => {
      if (event.relatedTarget && !event.relatedTarget.closest(".main-nav")) setMenu(false);
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".site-header")) setMenu(false);
    });
  }

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  };

  document.querySelectorAll("[data-music-player]").forEach((player) => {
    const audio = player.querySelector("audio");
    const toggle = player.querySelector("[data-music-toggle]");
    const progress = player.querySelector("[data-music-progress]");
    const time = player.querySelector("[data-music-time]");
    const status = player.querySelector("[data-music-status]");

    if (!audio || !toggle || !progress || !time || !status) return;

    const sourceUrl = audio.dataset.src;
    let sourceLoaded = false;

    const ensureSource = () => {
      if (sourceLoaded || !sourceUrl) return;
      audio.src = sourceUrl;
      audio.load();
      sourceLoaded = true;
    };

    const updateToggle = () => {
      const playing = !audio.paused && !audio.ended;
      toggle.textContent = playing ? "Ⅱ" : "▶";
      toggle.setAttribute("aria-label", playing ? "Pause Eden by TesseracT" : "Play Eden by TesseracT");
      status.textContent = playing ? "Playing" : audio.currentTime > 0 ? "Paused" : "Press play to listen.";
    };

    const updateProgress = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      progress.max = String(duration || 0);
      progress.value = String(audio.currentTime || 0);
      time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
    };

    toggle.addEventListener("click", async () => {
      ensureSource();
      try {
        if (audio.paused) await audio.play();
        else audio.pause();
      } catch (error) {
        console.error("Audio playback failed:", error);
        status.textContent = "Playback could not start. Try again.";
      }
      updateToggle();
    });

    progress.addEventListener("input", () => {
      ensureSource();
      audio.currentTime = Number(progress.value);
      updateProgress();
    });

    ["play", "pause", "ended"].forEach((eventName) => audio.addEventListener(eventName, updateToggle));
    ["loadedmetadata", "durationchange", "timeupdate"].forEach((eventName) => audio.addEventListener(eventName, updateProgress));
    audio.addEventListener("error", () => {
      status.textContent = "The music file could not be loaded.";
      toggle.disabled = true;
    });

    updateToggle();
    updateProgress();
  });
})();
