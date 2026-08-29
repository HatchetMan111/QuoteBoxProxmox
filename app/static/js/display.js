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
    const svg = await loadIcon(q.icon);
    plaque.style.setProperty("--accent", q.accent);
    categoryLabel.textContent = q.category_label;
    medallion.innerHTML = svg;
    quoteText.textContent = q.text;
    quoteAuthor.textContent = q.author || q.category_label;
  }

  async function nextQuote() {
    try {
      const q = await fetchJSON("/api/quote");
      plaque.classList.add("fade");
      setTimeout(async () => {
        await renderQuote(q);
        plaque.classList.remove("fade");
      }, 550);
    } catch (e) {
      // Netzwerk kurz weg? Einfach beim naechsten Intervall erneut versuchen.
      console.error("QuoteBox: Spruch konnte nicht geladen werden", e);
    }
  }

  function scheduleRotation() {
    if (rotateTimer) clearInterval(rotateTimer);
    const ms = Math.max(3, settings.interval_seconds) * 1000;
    rotateTimer = setInterval(nextQuote, ms);
  }

  async function refreshSettings() {
    try {
      settings = await fetchJSON("/api/settings");
    } catch (e) {
      console.error("QuoteBox: Einstellungen konnten nicht geladen werden", e);
    }
    applyTheme();
    updateClockVisibility();
    scheduleRotation();
  }

  (async function init() {
    await refreshSettings();
    await nextQuote();
    setInterval(tickClock, 1000);
    tickClock();
    // Falls in /settings etwas geaendert wurde: alle 60s Einstellungen neu abholen.
    setInterval(refreshSettings, 60000);
  })();
})();
