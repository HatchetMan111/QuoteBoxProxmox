import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJSON, hexToRgba } from "../api";
import { ICONS } from "../icons";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const INTERVAL_MIN = 5;
const INTERVAL_MAX = 600; // deckungsgleich mit dem API-Limit (3..600)

function formatInterval(seconds) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m} min ${s} s` : `${m} min`;
  }
  return `${seconds} s`;
}

export default function SettingsPage() {
  const [categories, setCategories] = useState([]);
  const [state, setState] = useState(null); // lokale, evtl. ungespeicherte Einstellungen
  const [savedJson, setSavedJson] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | dirty | saving | saved | error
  const [hintVisible, setHintVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const hintTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    document.title = "QuoteBox – Einstellungen";
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const load = useCallback(async (attempt = 0) => {
    const seq = ++loadSeqRef.current;
    try {
      const [cats, cfg] = await Promise.all([fetchJSON("/api/categories"), fetchJSON("/api/settings")]);
      if (seq !== loadSeqRef.current) return; // ein neuerer Versuch ist unterwegs
      setCategories(cats);
      setState(cfg);
      setSavedJson(JSON.stringify(cfg));
      setLoadError(false);
      setSaveState("idle");
    } catch (e) {
      // Kurze Netzwerk-/Start-Schwankungen automatisch abfangen, bevor wir aufgeben.
      if (attempt < 2) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => load(attempt + 1), 1500);
        return;
      }
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = !!state && JSON.stringify(state) !== savedJson;

  // Theme sofort als Vorschau anwenden
  useEffect(() => {
    if (state) document.documentElement.dataset.theme = state.theme;
  }, [state]);

  // "Gespeichert" nach kurzer Zeit wieder ausblenden
  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2500);
    return () => clearTimeout(t);
  }, [saveState]);

  const update = (patch) => {
    setState((s) => (s ? { ...s, ...patch } : s));
    setSaveState("dirty");
  };

  // Ungespeicherte Aenderungen nicht stillschweigend verlieren.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const toggleCategory = (key) => {
    if (!state) return;
    const idx = state.active_categories.indexOf(key);
    if (idx >= 0) {
      if (state.active_categories.length <= 1) {
        // Letzte aktive Kategorie: Hinweis zeigen, statt stillschweigend zu ignorieren.
        setHintVisible(true);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setHintVisible(false), 2600);
        return;
      }
      update({ active_categories: state.active_categories.filter((c) => c !== key) });
    } else {
      update({ active_categories: [...state.active_categories, key] });
    }
  };

  const save = async () => {
    if (!state || !dirty || saving) return;
    setSaving(true);
    setSaveState("saving");
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
      setState(saved);
      setSavedJson(JSON.stringify(saved));
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
    } finally {
      setSaving(false);
    }
  };

  const statusText =
    saveState === "saving"
      ? "Speichern…"
      : saveState === "error"
        ? "Fehler beim Speichern"
        : saveState === "saved"
          ? "Gespeichert"
          : dirty
            ? "Ungespeicherte Änderungen"
            : "";

  if (loadError) {
    return (
      <div className="settings-wrap">
        <div className="settings-card">
          <h1>QuoteBox</h1>
          <div className="load-error">
            <span>Einstellungen konnten nicht geladen werden.</span>
            <button type="button" onClick={() => load()}>
              Erneut versuchen
            </button>
          </div>
          <a className="back-link" href="/display">
            ← Zurück zur Anzeige
          </a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="settings-wrap">
        <div className="settings-card">
          <h1>QuoteBox</h1>
          <p className="loading-note">Lade Einstellungen…</p>
        </div>
      </div>
    );
  }

  const fillPct = ((state.interval_seconds - INTERVAL_MIN) / (INTERVAL_MAX - INTERVAL_MIN)) * 100;
  const nightWindowEmpty = state.night_enabled && state.night_start === state.night_end;

  return (
    <div className="settings-wrap">
      <div className="settings-card">
        <h1>QuoteBox</h1>
        <p className="subtitle">Wähle, welche Sprüche gezeigt werden und wie.</p>

        <div className="field-group">
          <span className="field-label">Kategorien</span>
          <div className="category-grid">
            {categories.map((cat) => {
              const isActive = state.active_categories.includes(cat.key);
              const activeStyle = isActive
                ? {
                    borderColor: cat.accent,
                    color: cat.accent,
                    background: hexToRgba(cat.accent, 0.1),
                  }
                : {};
              return (
                <button
                  key={cat.key}
                  type="button"
                  className={"category-option" + (isActive ? " active" : "")}
                  style={{ "--cat-accent": cat.accent, ...activeStyle }}
                  aria-pressed={isActive}
                  onClick={() => toggleCategory(cat.key)}
                >
                  <span
                    className="icon-holder"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: ICONS[cat.icon] || ICONS["quote.svg"] }}
                  />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
          <div className={"grid-hint" + (hintVisible ? " visible" : "")} role="status">
            Mindestens eine Kategorie muss aktiv bleiben.
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Wechselintervall</span>
          <div className="range-row">
            <input
              type="range"
              min={INTERVAL_MIN}
              max={INTERVAL_MAX}
              step={5}
              value={state.interval_seconds}
              style={{ "--fill": `${fillPct}%` }}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) update({ interval_seconds: v });
              }}
              aria-label="Wechselintervall in Sekunden"
            />
            <span className="range-value">{formatInterval(state.interval_seconds)}</span>
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Darstellung</span>
          <div className="theme-choice">
            <button
              type="button"
              className={state.theme === "dark" ? "active" : ""}
              aria-pressed={state.theme === "dark"}
              onClick={() => update({ theme: "dark" })}
            >
              <span className="swatch swatch-dark" aria-hidden="true" />
              Dunkel
            </button>
            <button
              type="button"
              className={state.theme === "light" ? "active" : ""}
              aria-pressed={state.theme === "light"}
              onClick={() => update({ theme: "light" })}
            >
              <span className="swatch swatch-light" aria-hidden="true" />
              Hell
            </button>
          </div>
        </div>

        <div className="field-group">
          <div className="toggle-row">
            <span className="field-label inline">Uhrzeit &amp; Datum anzeigen</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!state.show_clock}
                onChange={(e) => update({ show_clock: e.target.checked })}
              />
              <span className="track">
                <span className="thumb" />
              </span>
            </label>
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Nachtabsenkung</span>
          <div className="toggle-row">
            <span className="field-label inline">Nachts dimmen bzw. abschalten (Einbrennschutz)</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!state.night_enabled}
                onChange={(e) => update({ night_enabled: e.target.checked })}
              />
              <span className="track">
                <span className="thumb" />
              </span>
            </label>
          </div>
          <div className={"night-details" + (state.night_enabled ? "" : " disabled")}>
            <div className="theme-choice night-mode-choice">
              <button
                type="button"
                disabled={!state.night_enabled}
                className={state.night_mode === "dim" ? "active" : ""}
                aria-pressed={state.night_mode === "dim"}
                onClick={() => update({ night_mode: "dim" })}
              >
                Dimmen
              </button>
              <button
                type="button"
                disabled={!state.night_enabled}
                className={state.night_mode === "black" ? "active" : ""}
                aria-pressed={state.night_mode === "black"}
                onClick={() => update({ night_mode: "black" })}
              >
                Schwarz
              </button>
            </div>
            <div className="night-times">
              <label htmlFor="night-start">Von</label>
              <select
                id="night-start"
                disabled={!state.night_enabled}
                value={state.night_start}
                onChange={(e) => update({ night_start: parseInt(e.target.value, 10) })}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <label htmlFor="night-end">Bis</label>
              <select
                id="night-end"
                disabled={!state.night_enabled}
                value={state.night_end}
                onChange={(e) => update({ night_end: parseInt(e.target.value, 10) })}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span className="night-note">Uhr</span>
            </div>
            {nightWindowEmpty && (
              <div className="night-warning" role="status">
                Von und Bis sind gleich – das Fenster ist leer, der Nachtmodus bleibt aus.
              </div>
            )}
          </div>
        </div>

        <div className="save-bar">
          <button
            type="button"
            className="save-btn"
            onClick={save}
            disabled={!dirty || saving}
          >
            Speichern
          </button>
          <span className={"save-status" + (saveState === "error" ? " error" : "")} role="status">
            {statusText}
          </span>
        </div>

        <a className="back-link" href="/display" onClick={(e) => {
          if (dirty && !window.confirm("Es gibt ungespeicherte Änderungen. Verwerfen?")) {
            e.preventDefault();
          }
        }}>
          ← Zurück zur Anzeige
        </a>
      </div>
    </div>
  );
}
