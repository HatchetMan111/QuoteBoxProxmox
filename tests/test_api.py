"""API-Tests fuer QuoteBox. Benoetigt: pytest, httpx (nur fuer die Tests, nicht im CT).

Ausfuehren vom Repo-Root:
    python3 -m venv venv && source venv/bin/activate
    pip install pytest httpx fastapi==0.115.0
    pytest tests/ -v
"""
import sys
from pathlib import Path

import pytest

APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))

import main  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """TestClient mit Einstellungs-/Spruch-Dateien im tmp-Verzeichnis (Seed bleibt real)."""
    monkeypatch.setattr(main, "QUOTES_FILE", tmp_path / "quotes.json")
    monkeypatch.setattr(main, "SETTINGS_FILE", tmp_path / "settings.json")
    main._quotes_cache = []
    main._last_quote_key = None
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c
    main._quotes_cache = []
    main._last_quote_key = None


# ---------- Grundlagen ----------

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["quotes_loaded"] > 0


def test_root_redirects_to_display(client):
    r = client.get("/", follow_redirects=False)
    assert r.status_code in (301, 302, 307)
    assert r.headers["location"].endswith("/display")


def test_pages_served_from_dist(client):
    for path in ("/display", "/settings"):
        r = client.get(path)
        assert r.status_code == 200
        assert "text/html" in r.headers["content-type"]
        assert '<div id="root">' in r.text


def test_static_assets_served(client):
    r = client.get("/manifest.webmanifest")
    assert r.status_code == 200
    manifest = r.json()
    assert manifest["start_url"] == "/display"
    assert manifest["icons"][0]["src"].startswith("/")
    assert client.get("/favicon.svg").status_code == 200


# ---------- Settings ----------

def test_default_settings(client):
    body = client.get("/api/settings").json()
    assert body["interval_seconds"] == 20
    assert body["theme"] == "dark"
    assert body["show_clock"] is False
    assert body["night_enabled"] is False
    assert set(body["active_categories"]) == set(main.CATEGORIES.keys())


def test_post_settings_roundtrip(client):
    payload = {
        "active_categories": ["zen", "humor"],
        "interval_seconds": 90,
        "theme": "light",
        "show_clock": True,
        "night_enabled": True,
        "night_mode": "black",
        "night_start": 22,
        "night_end": 6,
    }
    r = client.post("/api/settings", json=payload)
    assert r.status_code == 200
    assert r.json() == payload
    assert client.get("/api/settings").json() == payload


def test_post_settings_ignores_invalid_values(client):
    body = {
        "interval_seconds": 9999,       # ausserhalb 3..600
        "theme": "blue",                # unbekannt
        "night_mode": "green",          # unbekannt
        "night_start": 24,              # ausserhalb 0..23
        "active_categories": ["zen", "gibt-es-nicht"],
    }
    r = client.post("/api/settings", json=body)
    assert r.status_code == 200
    saved = r.json()
    assert saved["interval_seconds"] == 20  # Default bleibt
    assert saved["theme"] == "dark"
    assert saved["night_mode"] == "dim"
    assert saved["night_start"] == 23
    assert saved["active_categories"] == ["zen"]  # Unbekanntes wird gefiltert


def test_post_settings_invalid_json(client):
    r = client.post(
        "/api/settings",
        content=b"kein json",
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 400
    r = client.post("/api/settings", json=[1, 2, 3])
    assert r.status_code == 400


def test_settings_null_categories_hardening(tmp_path, monkeypatch):
    """settings.json mit "active_categories": null darf nicht 500 liefern (frueherer Crash-Pfad)."""
    monkeypatch.setattr(main, "QUOTES_FILE", tmp_path / "quotes.json")
    monkeypatch.setattr(main, "SETTINGS_FILE", tmp_path / "settings.json")
    main.SETTINGS_FILE.write_text(json_null_settings(), encoding="utf-8")
    settings = main.load_settings()
    assert isinstance(settings["active_categories"], list)
    assert settings["active_categories"]  # nicht leer


def json_null_settings():
    return '{"active_categories": null, "interval_seconds": 60}'


def test_settings_empty_categories_get_default(client):
    r = client.post("/api/settings", json={"active_categories": []})
    assert r.status_code == 200
    assert r.json()["active_categories"] == list(main.CATEGORIES.keys())


# ---------- Sprueche ----------

def test_quote_shape(client):
    q = client.get("/api/quote").json()
    assert q["text"]
    assert q["category"] in main.CATEGORIES or q["category"] == "quote"
    assert q["category_label"]
    assert q["icon"].endswith(".svg")
    assert q["accent"].startswith("#")


def test_quote_no_immediate_repeat(client):
    texts = [client.get("/api/quote").json()["text"] for _ in range(20)]
    for a, b in zip(texts, texts[1:]):
        assert a != b  # Seed hat genug Eintraege; kein Haenger durch Doppel-Wurf


def test_quote_respects_category_filter(client):
    client.post("/api/settings", json={"active_categories": ["zen"]})
    for _ in range(10):
        assert client.get("/api/quote").json()["category"] == "zen"


def test_random_category_mixes_all(client):
    client.post("/api/settings", json={"active_categories": ["random"]})
    seen = {client.get("/api/quote").json()["category"] for _ in range(40)}
    assert len(seen) > 1  # Zufall mischt ueber alle Kategorien


def test_corrupt_quotes_json_recovers(tmp_path, monkeypatch):
    """Kaputte quotes.json: wird gesichert (.corrupt-*), Seed zeigt statt Crash."""
    monkeypatch.setattr(main, "QUOTES_FILE", tmp_path / "quotes.json")
    monkeypatch.setattr(main, "SETTINGS_FILE", tmp_path / "settings.json")
    main._quotes_cache = []
    main._last_quote_key = None
    main.QUOTES_FILE.write_text("{ das ist kein json", encoding="utf-8")

    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        r = c.get("/api/quote")
        assert r.status_code == 200
        assert r.json()["text"]

    backups = list(tmp_path.glob("quotes.json.corrupt-*.json"))
    assert backups, "kaputte Datei sollte als Backup gesichert werden"


def test_reload_after_manual_edit(client):
    first = client.post("/api/reload").json()
    assert first["status"] == "ok"
    assert first["quotes_loaded"] > 0

    # Eigene Sprueche ergaenzen (wie in der README beschrieben) und neu einlesen
    import json as _json

    quotes = _json.loads(main.QUOTES_FILE.read_text(encoding="utf-8"))
    quotes.append({"category": "zen", "text": "Test-Spruch fuer reload", "author": "pytest"})
    main.QUOTES_FILE.write_text(_json.dumps(quotes, ensure_ascii=False), encoding="utf-8")

    second = client.post("/api/reload").json()
    assert second["quotes_loaded"] == first["quotes_loaded"] + 1

    # Ungueltige Eintraege werden uebersprungen
    quotes.append({"category": "zen", "text": "   "})
    quotes.append({"category": 42, "text": "kaputt"})
    quotes.append("gar kein objekt")
    main.QUOTES_FILE.write_text(_json.dumps(quotes, ensure_ascii=False), encoding="utf-8")
    third = client.post("/api/reload").json()
    assert third["quotes_loaded"] == second["quotes_loaded"]  # 3 ungueltige ignoriert


def test_categories_endpoint(client):
    cats = client.get("/api/categories").json()
    keys = {c["key"] for c in cats}
    assert keys == set(main.CATEGORIES.keys())
    for c in cats:
        assert c["label"] and c["icon"].endswith(".svg") and c["accent"].startswith("#")
