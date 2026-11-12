import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJSON, hexToRgba } from "../api";
import { ICONS } from "../icons";

const FALLBACK_QUOTE = {
  text: "\u00A0",
  author: "",
  category_label: "",
  icon: "quote.svg",
  accent: "#a69c8c",
};

function isNightNow(settings, hour) {
  if (!settings.night_enabled) return false;
  const s = settings.night_start;
  const e = settings.night_end;
  if (s === e) return false; // leerer Zeitraum
  // 23 -> 7 ueberschreitet Mitternacht
  return s > e ? hour >= s || hour < e : hour >= s && hour < e;
}

function Clock({ show }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    // Tablet-Browser drosseln Timer im Hintergrund -> beim Ruecksprung nachziehen
    const onVis = () => {
      if (!document.hidden) setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="clock visible">
      <div className="time">{now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="date">
        {now.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
      </div>
    </div>
  );
}

export default function DisplayPage() {
  const [settings, setSettings] = useState({
    interval_seconds: 20,
    theme: "dark",
    show_clock: false,
    night_enabled: false,
    night_mode: "dim",
    night_start: 23,
    night_end: 7,
  });
  const [quote, setQuote] = useState(FALLBACK_QUOTE);
  const [fading, setFading] = useState(false);
  const [now, setNow] = useState(() => new Date()); // fuer das Nacht-Zeitfenster
  const [fullscreen, setFullscreen] = useState(false);
  const [cycle, setCycle] = useState(0); // startet die Fortschritts-Linie neu

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);
  const retryRef = useRef(null);
  const fadeRef = useRef(null);

  useEffect(() => {
    document.title = "QuoteBox";
  }, []);

  // Theme global setzen (CSS-Variablen haengen an html[data-theme])
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const nextQuote = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const seq = ++seqRef.current;
    (async () => {
      try {
        const q = await fetchJSON("/api/quote");
        if (seq !== seqRef.current) return; // veralteter Request
        setFading(true);
        if (fadeRef.current) clearTimeout(fadeRef.current);
        fadeRef.current = setTimeout(() => {
          if (seq !== seqRef.current) return;
          setQuote(q);
          setFading(false);
          setCycle((c) => c + 1);
        }, 450);
      } catch (e) {
        // Netzwerk kurz weg? Kurz spaeter erneut versuchen, statt den ganzen Intervall zu warten.
        if (retryRef.current) clearTimeout(retryRef.current);
        retryRef.current = setTimeout(nextQuote, 5000);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, []);

  useEffect(() => () => {
    if (retryRef.current) clearTimeout(retryRef.current);
    if (fadeRef.current) clearTimeout(fadeRef.current);
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const fresh = await fetchJSON("/api/settings");
      const prev = settingsRef.current;
      const intervalChanged = fresh.interval_seconds !== prev.interval_seconds;
      const categoriesChanged =
        JSON.stringify(fresh.active_categories) !== JSON.stringify(prev.active_categories);
      setSettings(fresh);
      if (intervalChanged) setCycle((c) => c + 1); // Fortschritts-Linie neu starten
      if (categoriesChanged) nextQuote();
    } catch (e) {
      // Beim naechsten Zyklus erneut versuchen.
    }
  }, [nextQuote]);

  // Erster Lauf: Einstellungen + Spruch laden
  useEffect(() => {
    refreshSettings().then(nextQuote);
  }, [refreshSettings, nextQuote]);

  // Rotation
  useEffect(() => {
    const ms = Math.max(3, settings.interval_seconds || 20) * 1000;
    const t = setInterval(nextQuote, ms);
    return () => clearInterval(t);
  }, [settings.interval_seconds, nextQuote]);

  // Einstellungen periodisch syncen (Aenderungen aus /settings uebernehmen)
  useEffect(() => {
    const t = setInterval(refreshSettings, 30000);
    const onVis = () => {
      if (!document.hidden) {
        setNow(new Date());
        refreshSettings();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshSettings]);

  // Nacht-Zeitfenster-Grenzen uebergangslos treffen
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Tablet-UX: Leertaste/Pfeil-rechts holt sofort den naechsten Spruch;
  // Vollbild-Status fuer das Button-Icon mitführen.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "ArrowRight") {
        e.preventDefault();
        nextQuote();
      }
    };
    const onFsChange = () =>
      setFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, [nextQuote]);

  const fsSupported =
    typeof document !== "undefined" &&
    !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  const toggleFullscreen = () => {
    const el = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      }
    } catch (e) {
      // Manche Browser lehnen Vollbild ohne Nutzer-Geste oder komplett ab.
    }
  };

  const night = isNightNow(settings, now.getHours());
  const dim = night && settings.night_mode === "dim";
  const black = night && settings.night_mode === "black";

  const accent = quote.accent || "#a69c8c";
  const svg = ICONS[quote.icon] || ICONS["quote.svg"];
  const intervalMs = Math.max(3, settings.interval_seconds || 20) * 1000;

  return (
    <div className={"stage" + (dim ? " night-dim" : "")}>
      <Clock show={settings.show_clock} />

      <div
        className={"plaque" + (fading ? " fade" : "")}
        style={{ "--accent": accent }}
        onClick={nextQuote}
        onKeyDown={(e) => {
          if (e.code === "Enter") nextQuote();
        }}
        role="button"
        tabIndex={0}
        aria-label="Nächsten Spruch anzeigen"
      >
        <div className="category-label">{quote.category_label || "\u00A0"}</div>
        <div className="medallion" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="quote-text" aria-live="polite">
          {quote.text || "\u00A0"}
        </p>
        <div className="rule" />
        <div className="author">{quote.author || quote.category_label || "\u00A0"}</div>
        <div className="progress" aria-hidden="true">
          <div
            key={cycle}
            className="progress-bar"
            style={{ animationDuration: `${intervalMs}ms`, background: hexToRgba(accent, 0.4) }}
          />
        </div>
      </div>

      {fsSupported && (
        <button
          type="button"
          className="corner-link fs-link"
          onClick={toggleFullscreen}
          aria-label="Vollbild umschalten"
        >
          {fullscreen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4v5H4" />
              <path d="M15 4v5h5" />
              <path d="M9 20v-5H4" />
              <path d="M15 20v-5h5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9V4h5" />
              <path d="M20 9V4h-5" />
              <path d="M4 15v5h5" />
              <path d="M20 15v5h-5" />
            </svg>
          )}
        </button>
      )}

      <a className="corner-link gear-link" href="/settings" aria-label="Einstellungen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 13.5c.04-.5.04-1 0-1.5l1.9-1.5-2-3.4-2.2.9c-.4-.3-.8-.6-1.3-.8l-.3-2.4H10.5l-.3 2.4c-.5.2-.9.5-1.3.8l-2.2-.9-2 3.4 1.9 1.5c-.04.5-.04 1 0 1.5l-1.9 1.5 2 3.4 2.2-.9c.4.3.8.6 1.3.8l.3 2.4h3.9l.3-2.4c.5-.2.9-.5 1.3-.8l2.2.9 2-3.4-1.9-1.5Z" />
        </svg>
      </a>

      <div className={"night-veil" + (black ? " visible" : "")} aria-hidden="true" />
    </div>
  );
}
