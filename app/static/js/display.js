(() => {
  const plaque = document.getElementById("plaque");
  const categoryLabel = document.getElementById("category-label");
  const medallion = document.getElementById("medallion");
  const quoteText = document.getElementById("quote-text");
  const quoteAuthor = document.getElementById("quote-author");
  const clock = document.getElementById("clock");
  const clockTime = document.getElementById("clock-time");
  const clockDate = document.getElementById("clock-date");

  const iconCache = new Map();
  let rotateTimer = null;
  let retryTimer = null;
  let fetchSeq = 0;
  let inFlight = false;
  let settingsJson = "";
  let settings = { interval_seconds: 20, theme: "dark", show_clock: false };

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  async function loadIcon(name) {
    if (iconCache.has(name)) return iconCache.get(name);
    try {
      const res = await fetch(`/static/icons/${name}`);
      const svg = await res.text();
      iconCache.set(name, svg);
      return svg;
    } catch (e) {
      return "";
    }
  }

  function applyTheme() {
    document.body.classList.toggle("theme-light", settings.theme === "light");
  }

  function updateClockVisibility() {
    clock.classList.toggle("visible", !!settings.show_clock);
  }

  function tickClock() {
    if (!settings.show_clock) return;
    const now = new Date();
    clockTime.textContent = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    clockDate.textContent = now.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
  }

  async function renderQuote(q) {
    const svg = await loadIcon(q.icon || "quote.svg");
    plaque.style.setProperty("--accent", q.accent || "#a69c8c");
    categoryLabel.textContent = q.category_label || "";
    medallion.innerHTML = svg;
    quoteText.textContent = q.text || "";
    quoteAuthor.textContent = q.author || q.category_label || "";
  }

  async function nextQuote() {
    if (inFlight) return;
    inFlight = true;
    const seq = ++fetchSeq;
    try {
      const q = await fetchJSON("/api/quote");
      if (seq !== fetchSeq) return; // veralteter Request: frischeres Ergebnis ist unterwegs
      plaque.classList.add("fade");
      setTimeout(async () => {
        if (seq !== fetchSeq) return;
        await renderQuote(q);
        plaque.classList.remove("fade");
      }, 450);
    } catch (e) {
      // Netzwerk kurz weg? Kurz spaeter erneut versuchen, statt den ganzen Intervall zu warten.
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(nextQuote, 5000);
    } finally {
      inFlight = false;
    }
  }

  function scheduleRotation() {
    if (rotateTimer) clearInterval(rotateTimer);
    const ms = Math.max(3, settings.interval_seconds || 20) * 1000;
    rotateTimer = setInterval(nextQuote, ms);
  }

  async function refreshSettings() {
    try {
      const fresh = await fetchJSON("/api/settings");
      const freshJson = JSON.stringify(fresh);
      const changed = freshJson !== settingsJson;
      const intervalChanged = fresh.interval_seconds !== settings.interval_seconds;
      const categoriesChanged = JSON.stringify(fresh.active_categories) !== JSON.stringify(settings.active_categories);
      settings = fresh;
      settingsJson = freshJson;
      if (!changed) return;
      applyTheme();
      updateClockVisibility();
      if (intervalChanged) scheduleRotation();
      if (categoriesChanged) nextQuote();
    } catch (e) {
      // Beim naechsten Zyklus erneut versuchen.
    }
  }

  function manualAdvance() {
    if (inFlight) return;
    nextQuote();
  }

  (async function init() {
    await refreshSettings();
    settingsJson = JSON.stringify(settings);
    applyTheme();
    updateClockVisibility();
    tickClock();
    setInterval(tickClock, 1000);
    await nextQuote();
    scheduleRotation();
    // Tablet-UX: Tipp auf die Plakette holt sofort den naechsten Spruch.
    plaque.addEventListener("click", manualAdvance);
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code === "ArrowRight") {
        e.preventDefault();
        manualAdvance();
      }
    });
    // Falls in /settings etwas geaendert wurde: Periodisch pruefen, aber nur
    // reagieren, wenn sich wirklich etwas geaendert hat.
    setInterval(refreshSettings, 60000);
  })();
})();
