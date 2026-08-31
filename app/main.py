"""
QuoteBox - kleine lokale Spruch-Anzeige fuer ein Wand-Tablet.

Laeuft komplett lokal (keine externen Aufrufe im Betrieb):
- /display  -> Vollbild-Ansicht fuer das Tablet
- /settings -> Kategorien, Intervall, Theme, Uhrzeit an/aus
- /api/*    -> kleine JSON-API fuer die beiden Seiten
"""
from __future__ import annotations

import json
import random
import threading
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SEED_FILE = DATA_DIR / "seed" / "quotes.json"
QUOTES_FILE = DATA_DIR / "quotes.json"
SETTINGS_FILE = DATA_DIR / "settings.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)

# Kategorie-Metadaten: Label, Icon-Datei, Akzentfarbe (fuer die Plakette)
# "random" ist eine virtuelle Kategorie: aktiv = Sprüche aus ALLEN Kategorien.
CATEGORIES: dict[str, dict[str, str]] = {
    "stoic": {"label": "Stoisch", "icon": "stoic.svg", "accent": "#b08d57"},
    "calendar": {"label": "Kalendersprüche", "icon": "calendar.svg", "accent": "#5b7c99"},
    "motivation": {"label": "Motivation", "icon": "motivation.svg", "accent": "#c1622d"},
    "zen": {"label": "Zen", "icon": "zen.svg", "accent": "#6b8e6b"},
    "humor": {"label": "Humor", "icon": "humor.svg", "accent": "#d4a73b"},
    "random": {"label": "Zufall", "icon": "random.svg", "accent": "#8a7fb0"},
}

DEFAULT_SETTINGS = {
    "active_categories": list(CATEGORIES.keys()),
    "interval_seconds": 20,
    "theme": "dark",
    "show_clock": False,
    "night_enabled": False,
    "night_mode": "dim",  # "dim" = abgedunkelt, "black" = schwarz (Einbrennschutz)
    "night_start": 23,    # Stunde 0-23
    "night_end": 7,
}

_lock = threading.Lock()
_quotes_cache: list[dict] = []
_last_quote_key: tuple[str, str] | None = None  # (category, text) des letzten Spruchs


def _seed_quotes() -> list[dict]:
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


def _read_user_quotes() -> list[dict] | None:
    """Liest quotes.json; bei korrupter Datei wird sie gesichert und neu eingespeist."""
    try:
        return json.loads(QUOTES_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, OSError) as exc:
        backup = QUOTES_FILE.with_suffix(f".corrupt-{int(time.time())}.json")
        try:
            QUOTES_FILE.replace(backup)
        except OSError:
            pass
        print(f"QuoteBox: quotes.json unlesbar ({exc}) -> gesichert als {backup.name}, Seed wird neu eingespielt")
        return None


def _valid_quotes(quotes: list) -> list[dict]:
    """Behaelt nur brauchbare Eintraege: Text vorhanden, Kategorie bekannt oder zumindest Text+Kategorie als String."""
    out = []
    for q in quotes:
        if not isinstance(q, dict):
            continue
        text = q.get("text")
        category = q.get("category")
        if not isinstance(text, str) or not text.strip():
            continue
        if not isinstance(category, str) or not category:
            continue
        out.append(q)
    return out


def _ensure_quotes_file() -> None:
    """Kopiert den Seed-Datensatz einmalig, falls noch keine quotes.json existiert."""
    if not QUOTES_FILE.exists():
        QUOTES_FILE.write_text(
            json.dumps(_seed_quotes(), ensure_ascii=False, indent=2), encoding="utf-8"
        )


def load_quotes(force: bool = False) -> list[dict]:
    """Laedt die Sprueche; faellt bei Problemen automatisch auf den Seed zurueck."""
    global _quotes_cache
    with _lock:
        if force or not _quotes_cache:
            _ensure_quotes_file()
            user_quotes = _read_user_quotes()
            valid = _valid_quotes(user_quotes) if user_quotes is not None else []
            if valid:
                _quotes_cache = valid
            else:
                if user_quotes is not None:
                    print("QuoteBox: quotes.json enthaelt keine gueltigen Eintraege -> Seed-Daten werden angezeigt")
                _quotes_cache = _valid_quotes(_seed_quotes())
        return _quotes_cache


def load_settings() -> dict:
    if not SETTINGS_FILE.exists():
        save_settings(DEFAULT_SETTINGS)
        return dict(DEFAULT_SETTINGS)
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("settings.json ist kein Objekt")
    except (json.JSONDecodeError, OSError, ValueError):
        data = {}
    merged = dict(DEFAULT_SETTINGS)
    merged.update({k: v for k, v in data.items() if k in DEFAULT_SETTINGS})
    if merged["active_categories"] not in (None, []) and not isinstance(merged["active_categories"], list):
        merged["active_categories"] = list(CATEGORIES.keys())
    return merged


def save_settings(settings: dict) -> None:
    with _lock:
        SETTINGS_FILE.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")


app = FastAPI(title="QuoteBox")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/display")


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "quotes_loaded": len(load_quotes())})


@app.get("/api/categories")
def api_categories() -> JSONResponse:
    return JSONResponse([{"key": key, **meta} for key, meta in CATEGORIES.items()])


@app.get("/api/settings")
def api_get_settings() -> JSONResponse:
    return JSONResponse(load_settings())


@app.post("/api/settings")
async def api_set_settings(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "Body ist kein gueltiges JSON"}, status_code=400)
    if not isinstance(body, dict):
        return JSONResponse({"detail": "Body muss ein JSON-Objekt sein"}, status_code=400)

    current = load_settings()

    active = body.get("active_categories")
    if isinstance(active, list):
        cleaned = [c for c in active if isinstance(c, str) and c in CATEGORIES]
        if cleaned:
            current["active_categories"] = cleaned

    interval = body.get("interval_seconds")
    if isinstance(interval, (int, float)) and not isinstance(interval, bool) and 3 <= interval <= 600:
        current["interval_seconds"] = int(interval)

    theme = body.get("theme")
    if theme in ("dark", "light"):
        current["theme"] = theme

    show_clock = body.get("show_clock")
    if isinstance(show_clock, bool):
        current["show_clock"] = show_clock

    night_enabled = body.get("night_enabled")
    if isinstance(night_enabled, bool):
        current["night_enabled"] = night_enabled

    night_mode = body.get("night_mode")
    if night_mode in ("dim", "black"):
        current["night_mode"] = night_mode

    for key in ("night_start", "night_end"):
        val = body.get(key)
        if isinstance(val, int) and not isinstance(val, bool) and 0 <= val <= 23:
            current[key] = val

    if not current["active_categories"]:
        current["active_categories"] = list(CATEGORIES.keys())

    save_settings(current)
    return JSONResponse(current)


@app.get("/api/quote")
def api_quote() -> JSONResponse:
    global _last_quote_key
    settings = load_settings()
    active = [c for c in settings["active_categories"] if c in CATEGORIES]
    if "random" in active:
        quotes = load_quotes()
    else:
        quotes = [q for q in load_quotes() if q.get("category") in active] if active else load_quotes()
    if not quotes:
        quotes = load_quotes()
    if not quotes:
        return JSONResponse(
            {
                "text": "Sprüche-Datei ist leer.",
                "author": "QuoteBox",
                "category": "quote",
                "category_label": "QuoteBox",
                "icon": "quote.svg",
                "accent": "#a69c8c",
            }
        )

    # Sofortige Wiederholung vermeiden (fuer ein Wand-Tablet wirkt das sonst wie ein Haenger)
    chosen = random.choice(quotes)
    key = (str(chosen.get("category", "")), str(chosen.get("text", "")))
    if len(quotes) > 1:
        for _ in range(10):
            if key != _last_quote_key:
                break
            chosen = random.choice(quotes)
            key = (str(chosen.get("category", "")), str(chosen.get("text", "")))
    _last_quote_key = key

    meta = CATEGORIES.get(
        chosen["category"],
        {"label": chosen["category"].capitalize(), "icon": "quote.svg", "accent": "#a69c8c"},
    )
    author = chosen.get("author")
    return JSONResponse(
        {
            "text": chosen["text"],
            "author": author if isinstance(author, str) else "",
            "category": chosen["category"],
            "category_label": meta["label"],
            "icon": meta["icon"],
            "accent": meta["accent"],
        }
    )


@app.post("/api/reload")
def api_reload() -> JSONResponse:
    """Laedt quotes.json neu ein, falls sie manuell bearbeitet wurde."""
    quotes = load_quotes(force=True)
    return JSONResponse({"status": "ok", "quotes_loaded": len(quotes)})


@app.get("/display")
def display_page(request: Request):
    return templates.TemplateResponse("display.html", {"request": request})


@app.get("/settings")
def settings_page(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request})
