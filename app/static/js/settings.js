(() => {
  const grid = document.getElementById("category-grid");
  const gridHint = document.getElementById("grid-hint");
  const intervalInput = document.getElementById("interval");
  const intervalValue = document.getElementById("interval-value");
  const themeDarkBtn = document.getElementById("theme-dark");
  const themeLightBtn = document.getElementById("theme-light");
  const showClockInput = document.getElementById("show-clock");
  const nightEnabled = document.getElementById("night-enabled");
  const nightDimBtn = document.getElementById("night-dim");
  const nightBlackBtn = document.getElementById("night-black");
  const nightStartSel = document.getElementById("night-start");
  const nightEndSel = document.getElementById("night-end");
  const nightDetails = document.getElementById("night-details");
  const saveBtn = document.getElementById("save-btn");
  const saveStatus = document.getElementById("save-status");
  const loadError = document.getElementById("load-error");
  const retryBtn = document.getElementById("retry-btn");
  const settingsForm = document.getElementById("settings-form");

  const iconCache = new Map();
  let categories = [];
  let state = null;
  let savedJson = "";
  let dirty = false;
  let hintTimer = null;

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  function formatInterval(seconds) {
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return s > 0 ? `${m} min ${s} s` : `${m} min`;
    }
    return `${seconds} s`;
  }

  function snapshot() {
    savedJson = JSON.stringify(state);
    dirty = false;
    saveBtn.disabled = true;
    saveStatus.textContent = "";
  }

  function markDirty() {
    if (JSON.stringify(state) === savedJson) return;
    dirty = true;
    saveBtn.disabled = false;
    saveStatus.textContent = "Ungespeicherte Änderungen";
  }

  function setTheme(theme) {
    state.theme = theme;
    themeDarkBtn.classList.toggle("active", theme === "dark");
    themeDarkBtn.setAttribute("aria-pressed", theme === "dark");
    themeLightBtn.classList.toggle("active", theme === "light");
    themeLightBtn.setAttribute("aria-pressed", theme === "light");
    document.body.classList.toggle("theme-light", theme === "light");
  }

  async function loadIcon(name) {
    if (iconCache.has(name)) return iconCache.get(name);
    const res = await fetch(`/static/icons/${name}`);
    const svg = await res.text();
    iconCache.set(name, svg);
    return svg;
  }

  function setNightMode(mode) {
    state.night_mode = mode;
    nightDimBtn.classList.toggle("active", mode === "dim");
    nightDimBtn.setAttribute("aria-pressed", mode === "dim");
    nightBlackBtn.classList.toggle("active", mode === "black");
    nightBlackBtn.setAttribute("aria-pressed", mode === "black");
  }

  function fillHourSelect(sel, selected) {
    sel.innerHTML = "";
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = `${String(h).padStart(2, "0")}:00`;
      if (h === selected) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function updateNightUiEnabled() {
    const on = !!state.night_enabled;
    nightDetails.classList.toggle("disabled", !on);
    nightDimBtn.disabled = !on;
    nightBlackBtn.disabled = !on;
    nightStartSel.disabled = !on;
    nightEndSel.disabled = !on;
  }

  function renderCategoryGrid() {
    grid.innerHTML = "";
    categories.forEach((cat) => {
      const isActive = state.active_categories.includes(cat.key);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "category-option" + (isActive ? " active" : "");
      btn.style.setProperty("--cat-accent", cat.accent);
      btn.dataset.key = cat.key;
      btn.setAttribute("aria-pressed", isActive);
      btn.innerHTML = `<span class="icon-holder" aria-hidden="true"></span><span>${cat.label}</span>`;
      btn.addEventListener("click", () => {
        const idx = state.active_categories.indexOf(cat.key);
        if (idx >= 0) {
          if (state.active_categories.length <= 1) {
            // Letzte aktive Kategorie: Hinweis zeigen, statt stillschweigend zu ignorieren.
            gridHint.classList.add("visible");
            if (hintTimer) clearTimeout(hintTimer);
            hintTimer = setTimeout(() => gridHint.classList.remove("visible"), 2600);
            return;
          }
          state.active_categories.splice(idx, 1);
        } else {
          state.active_categories.push(cat.key);
        }
        markDirty();
        renderCategoryGrid();
      });
      grid.appendChild(btn);

      loadIcon(cat.icon)
        .then((svg) => {
          btn.querySelector(".icon-holder").innerHTML = svg;
        })
        .catch(() => {});
    });
  }

  async function init(attempt = 0) {
    loadError.hidden = true;
    try {
      const [cats, cfg] = await Promise.all([fetchJSON("/api/categories"), fetchJSON("/api/settings")]);
      categories = cats;
      state = cfg;
    } catch (e) {
      // Kurze Netzwerk-/Start-Schwankungen automatisch abfangen, bevor wir aufgeben.
      if (attempt < 2) {
        setTimeout(() => init(attempt + 1), 1500);
        return;
      }
      settingsForm.hidden = true;
      loadError.hidden = false;
      return;
    }

    settingsForm.hidden = false;
    renderCategoryGrid();
    intervalInput.value = state.interval_seconds;
    intervalValue.textContent = formatInterval(state.interval_seconds);
    setTheme(state.theme);
    showClockInput.checked = !!state.show_clock;
    nightEnabled.checked = !!state.night_enabled;
    setNightMode(state.night_mode || "dim");
    fillHourSelect(nightStartSel, state.night_start);
    fillHourSelect(nightEndSel, state.night_end);
    updateNightUiEnabled();
    snapshot();
  }

  intervalInput.addEventListener("input", () => {
    state.interval_seconds = parseInt(intervalInput.value, 10);
    intervalValue.textContent = formatInterval(state.interval_seconds);
    markDirty();
  });

  themeDarkBtn.addEventListener("click", () => { setTheme("dark"); markDirty(); });
  themeLightBtn.addEventListener("click", () => { setTheme("light"); markDirty(); });

  showClockInput.addEventListener("change", () => {
    state.show_clock = showClockInput.checked;
    markDirty();
  });

  nightEnabled.addEventListener("change", () => {
    state.night_enabled = nightEnabled.checked;
    updateNightUiEnabled();
    markDirty();
  });

  nightDimBtn.addEventListener("click", () => { setNightMode("dim"); markDirty(); });
  nightBlackBtn.addEventListener("click", () => { setNightMode("black"); markDirty(); });

  nightStartSel.addEventListener("change", () => {
    state.night_start = parseInt(nightStartSel.value, 10);
    markDirty();
  });

  nightEndSel.addEventListener("change", () => {
    state.night_end = parseInt(nightEndSel.value, 10);
    markDirty();
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      const saved = await fetchJSON("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active_categories: state.active_categories,
          interval_seconds: state.interval_seconds,
          theme: state.theme,
          show_clock: state.show_clock,
          night_enabled: state.night_enabled,
          night_mode: state.night_mode,
          night_start: state.night_start,
          night_end: state.night_end,
        }),
      });
      state = saved;
      snapshot();
      saveStatus.textContent = "Gespeichert";
      setTimeout(() => {
        if (!dirty) saveStatus.textContent = "";
      }, 2000);
    } catch (e) {
      saveStatus.textContent = "Fehler beim Speichern";
      saveBtn.disabled = false;
    }
  });

  retryBtn.addEventListener("click", init);

  // Ungespeicherte Änderungen nicht stillschweigend verlieren.
  document.querySelector(".back-link").addEventListener("click", (e) => {
    if (dirty && !window.confirm("Es gibt ungespeicherte Änderungen. Verwerfen?")) {
      e.preventDefault();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  init();
})();
