(() => {
  const grid = document.getElementById("category-grid");
  const intervalInput = document.getElementById("interval");
  const intervalValue = document.getElementById("interval-value");
  const themeDarkBtn = document.getElementById("theme-dark");
  const themeLightBtn = document.getElementById("theme-light");
  const showClockInput = document.getElementById("show-clock");
  const saveBtn = document.getElementById("save-btn");
  const saveStatus = document.getElementById("save-status");

  let categories = [];
  let state = { active_categories: [], interval_seconds: 20, theme: "dark", show_clock: false };

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
  }

  function setTheme(theme) {
    state.theme = theme;
    themeDarkBtn.classList.toggle("active", theme === "dark");
    themeLightBtn.classList.toggle("active", theme === "light");
    document.body.classList.toggle("theme-light", theme === "light");
  }

  function renderCategoryGrid() {
    grid.innerHTML = "";
    categories.forEach((cat) => {
      const isActive = state.active_categories.includes(cat.key);
      const el = document.createElement("div");
      el.className = "category-option" + (isActive ? " active" : "");
      el.style.setProperty("--cat-accent", cat.accent);
      el.dataset.key = cat.key;
      el.innerHTML = `<span class="icon-holder"></span><span>${cat.label}</span>`;
      el.addEventListener("click", () => {
        const idx = state.active_categories.indexOf(cat.key);
        if (idx >= 0) {
          if (state.active_categories.length > 1) state.active_categories.splice(idx, 1);
        } else {
          state.active_categories.push(cat.key);
        }
        renderCategoryGrid();
      });
      grid.appendChild(el);

      fetch(`/static/icons/${cat.icon}`)
        .then((r) => r.text())
        .then((svg) => {
          el.querySelector(".icon-holder").innerHTML = svg;
        });
    });
  }

  async function init() {
    categories = await fetchJSON("/api/categories");
    state = await fetchJSON("/api/settings");

    renderCategoryGrid();
    intervalInput.value = state.interval_seconds;
    intervalValue.textContent = `${state.interval_seconds} s`;
    setTheme(state.theme);
    showClockInput.checked = !!state.show_clock;
  }

  intervalInput.addEventListener("input", () => {
    intervalValue.textContent = `${intervalInput.value} s`;
  });

  themeDarkBtn.addEventListener("click", () => setTheme("dark"));
  themeLightBtn.addEventListener("click", () => setTheme("light"));

  saveBtn.addEventListener("click", async () => {
    const payload = {
      active_categories: state.active_categories,
      interval_seconds: parseInt(intervalInput.value, 10),
      theme: state.theme,
      show_clock: showClockInput.checked,
    };
    try {
      await fetchJSON("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      saveStatus.classList.add("visible");
      setTimeout(() => saveStatus.classList.remove("visible"), 2000);
    } catch (e) {
      saveStatus.textContent = "Fehler beim Speichern";
      saveStatus.classList.add("visible");
    }
  });

  init();
})();
