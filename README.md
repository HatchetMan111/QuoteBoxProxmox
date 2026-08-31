# QuoteBox

Lokale Sprüche-Anzeige für ein altes Tablet als Wand-Eye-Catcher. Läuft als LXC-Container auf Proxmox, komplett lokal (kein Cloud-Dienst nötig).

Kategorien: **Stoisch**, **Kalendersprüche**, **Motivation**, **Zen**, **Humor** – jeweils mit passendem Icon, in den Einstellungen frei kombinierbar.

- `http://<LXC-IP>:5000/display` – Vollbild-Ansicht fürs Tablet. **Tipp auf die Plakette** (oder Leertaste/Pfeil-rechts) holt sofort den nächsten Spruch.
- `http://<LXC-IP>:5000/settings` – Kategorien, Wechselintervall, Hell/Dunkel, Uhrzeit an/aus. Ungespeicherte Änderungen werden angezeigt; mindestens eine Kategorie bleibt immer aktiv.

## Installation (Proxmox-Host-Shell)

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/HatchetMan111/QuoteBoxProxmox/main/ct/quotebox.sh)"
```

Das Skript fragt CT-ID, Ressourcen etc. ab (Standard: 1 vCPU, 512 MB RAM, 4 GB Disk, Debian 12, unprivilegiert), baut den Container, installiert die App darin und prüft am Ende selbst:

- `systemctl is-active quotebox`
- HTTP-Check auf `http://127.0.0.1:5000/health` (im Container) und `http://<CT-IP>:5000/health` (vom Host)

Die App läuft als eigener Systembenutzer `quotebox` (kein Root). Bei Erfolg zeigt das Skript die fertige URL inkl. Container-IP an. Schlägt ein Schritt fehl, gibt es automatisch das komplette `journalctl -u quotebox`-Log sowie die `curl -v`-Ausgabe aus – nichts wird stillschweigend verschluckt.

## Tablet einrichten

1. Browser auf dem Tablet öffnen, `http://<LXC-IP>:5000/display` aufrufen.
2. Als Startseite/Lesezeichen speichern bzw. den Browser im Kiosk-/Vollbildmodus starten (z. B. Chrome mit `--kiosk http://<LXC-IP>:5000/display`, oder eine Kiosk-Browser-App aus dem jeweiligen App-Store, falls das Tablet-OS das nicht nativ unterstützt). Die Seite setzt `mobile-web-app-capable`/`apple-mobile-web-app-capable`, lässt sich also auch "zum Startbildschirm hinzufügen" und öffnet dann ohne Browser-Leiste.
3. Bildschirm-Standby deaktivieren bzw. auf "nie" stellen, damit die Anzeige dauerhaft läuft.

## Update

Das Update-Skript läuft **im Container** (nicht auf dem Host – das würde einen neuen Container anlegen). Entweder die CT-Konsole öffnen und dort den Einzeiler ausführen, oder vom Proxmox-Host aus:

```bash
pct exec <CTID> -- bash -c "$(curl -fsSL https://raw.githubusercontent.com/HatchetMan111/QuoteBoxProxmox/main/ct/quotebox.sh)"
```

Das Skript zieht den aktuellen Stand aus dem Repo, ersetzt den App-Code, startet den Dienst neu und prüft danach automatisch Dienst + HTTP. **Eigene Sprüche und Einstellungen (`app/data/`) bleiben dabei erhalten**; kann das Repo nicht geklont werden, bricht das Update ab, ohne die bestehende Installation anzutasten.

## Eigene Sprüche hinzufügen

Datei im Container bearbeiten:

```bash
pct exec <CTID> -- nano /opt/quotebox/app/data/quotes.json
```

Format je Eintrag: `{"category": "stoic|calendar|motivation|zen|humor", "text": "...", "author": "..."}`. Danach neu einlesen, ohne den Dienst neu zu starten:

```bash
pct exec <CTID> -- curl -X POST http://127.0.0.1:5000/api/reload
```

Fehlerhafte Einträge (fehlender Text, unbekannte Kategorie) werden übersprungen; ist die Datei kaputt oder leer, sichert QuoteBox sie als `quotes.json.corrupt-*.json` und zeigt automatisch die Seed-Sprüche, statt abzustürzen.

## Deinstallation

```bash
pct stop <CTID>
pct destroy <CTID>
```

## Fehlersuche

```bash
pct exec <CTID> -- systemctl status quotebox
pct exec <CTID> -- journalctl -u quotebox -n 100 --no-pager
pct exec <CTID> -- curl -v http://127.0.0.1:5000/health
```

## Lokaler Test ohne Proxmox

```bash
cd app
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5000
```

Danach `http://localhost:5000/display` und `http://localhost:5000/settings` im Browser öffnen.
