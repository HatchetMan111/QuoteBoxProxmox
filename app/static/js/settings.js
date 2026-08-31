(() => {
  const grid = document.getElementById("category-grid");
  const gridHint = document.getElementById("grid-hint");
  const intervalInput = document.getElementById("interval");
  const intervalValue = document.getElementById("interval-value");
  const themeDarkBtn = document.getElementById("theme-dark");
  const themeLightBtn = document.getElementById("theme-light");
  const showClockInput = document.getElementById("show-clock");
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

  async function init() {
    loadError.hidden = true;
    try {
      const [cats, cfg] = await Promise.all([fetchJSON("/api/categories"), fetchJSON("/api/settings")]);
      categories = cats;
      state = cfg;
    } catch (e) {
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
  init();
})();
