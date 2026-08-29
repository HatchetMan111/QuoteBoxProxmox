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
CATEGORIES: dict[str, dict[str, str]] = {
    "stoic": {"label": "Stoisch", "icon": "stoic.svg", "accent": "#b08d57"},
    "calendar": {"label": "Kalendersprüche", "icon": "calendar.svg", "accent": "#5b7c99"},
    "motivation": {"label": "Motivation", "icon": "motivation.svg", "accent": "#c1622d"},
    "zen": {"label": "Zen", "icon": "zen.svg", "accent": "#6b8e6b"},
    "humor": {"label": "Humor", "icon": "humor.svg", "accent": "#d4a73b"},
}

DEFAULT_SETTINGS = {
    "active_categories": list(CATEGORIES.keys()),
    "interval_seconds": 20,
    "theme": "dark",
    "show_clock": False,
}

_lock = threading.Lock()
_quotes_cache: list[dict] = []


def _ensure_quotes_file() -> None:
    """Kopiert den Seed-Datensatz einmalig, falls noch keine quotes.json existiert."""
    if not QUOTES_FILE.exists():
        seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        QUOTES_FILE.write_text(json.dumps(seed, ensure_ascii=False, indent=2), encoding="utf-8")


def load_quotes(force: bool = False) -> list[dict]:
    global _quotes_cache
    with _lock:
        if force or not _quotes_cache:
            _ensure_quotes_file()
            _quotes_cache = json.loads(QUOTES_FILE.read_text(encoding="utf-8"))
        return _quotes_cache


def load_settings() -> dict:
    if not SETTINGS_FILE.exists():
        save_settings(DEFAULT_SETTINGS)
        return dict(DEFAULT_SETTINGS)
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        data = dict(DEFAULT_SETTINGS)
    merged = dict(DEFAULT_SETTINGS)
    merged.update({k: v for k, v in data.items() if k in DEFAULT_SETTINGS})
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
    return JSONResponse(
        [{"key": key, **meta} for key, meta in CATEGORIES.items()]
    )


@app.get("/api/settings")
def api_get_settings() -> JSONResponse:
    return JSONResponse(load_settings())


@app.post("/api/settings")
async def api_set_settings(request: Request) -> JSONResponse:
    body = await request.json()
    current = load_settings()

    active = body.get("active_categories")
    if isinstance(active, list) and active:
        current["active_categories"] = [c for c in active if c in CATEGORIES]
    if not current["active_categories"]:
        current["active_categories"] = list(CATEGORIES.keys())

    interval = body.get("interval_seconds")
    if isinstance(interval, (int, float)) and 3 <= interval <= 600:
        current["interval_seconds"] = int(interval)

    theme = body.get("theme")
    if theme in ("dark", "light"):
        current["theme"] = theme

    show_clock = body.get("show_clock")
    if isinstance(show_clock, bool):
        current["show_clock"] = show_clock

    save_settings(current)
    return JSONResponse(current)


@app.get("/api/quote")
def api_quote() -> JSONResponse:
    settings = load_settings()
    active = settings["active_categories"] or list(CATEGORIES.keys())
    quotes = [q for q in load_quotes() if q["category"] in active]
    if not quotes:
        quotes = load_quotes()

    chosen = random.choice(quotes)
    meta = CATEGORIES.get(chosen["category"], {"label": chosen["category"], "icon": "quote.svg", "accent": "#a69c8c"})
    return JSONResponse(
        {
            "text": chosen["text"],
            "author": chosen.get("author", ""),
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
