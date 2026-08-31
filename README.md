# QuoteBox

Lokale Sprüche-Anzeige für ein altes Tablet als Wand-Eye-Catcher. Läuft als LXC-Container auf Proxmox, komplett lokal (kein Cloud-Dienst nötig).

Kategorien: **Stoisch**, **Kalendersprüche**, **Motivation**, **Zen**, **Humor** und **Zufall** (würfelt über alle Kategorien) – jeweils mit passendem Icon, in den Einstellungen frei kombinierbar.

- `http://<LXC-IP>:5000/display` – Vollbild-Ansicht fürs Tablet. **Tipp auf die Plakette** (oder Leertaste/Pfeil-rechts) holt sofort den nächsten Spruch.
- `http://<LXC-IP>:5000/settings` – Kategorien, Wechselintervall, Hell/Dunkel, Uhrzeit an/aus. Ungespeicherte Änderungen werden angezeigt und beim Verlassen gemeldet; mindestens eine Kategorie bleibt immer aktiv. Die Anzeige-Seite übernimmt Änderungen automatisch (spätestens ~30 s, sofort beim Zurückwechseln auf den Tab).

## Installation (Proxmox-Host-Shell)

```bash
bash -c "$(curl -fsSL https://cdn.jsdelivr.net/gh/HatchetMan111/QuoteBoxProxmox@main/ct/quotebox.sh)"
```

Alternativ direkt von GitHub (falls jsDelivr mal nicht erreichbar oder veraltet ist):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/HatchetMan111/QuoteBoxProxmox/main/ct/quotebox.sh)"
```

Das Skript fragt CT-ID, Ressourcen etc. ab (Standard: 1 vCPU, 512 MB RAM, 4 GB Disk, Debian 12, unprivilegiert), baut den Container, installiert die App darin und prüft am Ende selbst:

- `systemctl is-active quotebox`
- HTTP-Check auf `http://127.0.0.1:5000/health` (im Container) und `http://<CT-IP>:5000/health` (vom Host)

Die App läuft als eigener Systembenutzer `quotebox` (kein Root). Bei Erfolg zeigt das Skript die fertige URL inkl. Container-IP an. Schlägt ein Schritt fehl, gibt es automatisch das komplette `journalctl -u quotebox`-Log sowie die `curl -v`-Ausgabe aus – nichts wird stillschweigend verschluckt.

## Tablet einrichten

1. Browser auf dem Tablet öffnen, `http://<LXC-IP>:5000/display` aufrufen.
2. **Vollbild:** Über den Expand-Button unten rechts wird die Adresszeile ausgeblendet (Android/Chrome, Fullscreen-API). Auf iOS Safari gibt es das nicht – dort die Seite stattdessen über **„Zum Home-Bildschirm hinzufügen"** öffnen, sie startet dann ohne Adresszeile (die Seite setzt die passenden Meta-Tags). Alternativ den Browser im Kiosk-Modus starten (z. B. Chrome mit `--kiosk http://<LXC-IP>:5000/display`).
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

Antwortet `http://<CT-IP>:5000/health` vom Host aus mit **404** (statt Timeout), lauscht dort ein *anderer* Dienst – typischerweise ein IP-Konflikt (z. B. ein NAS; Synology DSM nutzt ebenfalls Port 5000). Das Install-Skript prüft das inzwischen selbst (MAC-Abgleich per ARP, Server-Header) und meldet den Konflikt direkt. Manuell:

```bash
pct exec <CTID> -- hostname -I          # IP, die der CT selbst meldet
ip neigh show <CT-IP>                   # auf dem Host: MAC hinter der IP (mit pct config <CTID> vergleichen)
curl --noproxy '*' -i http://<CT-IP>:5000/health   # Server-Header der Antwort ansehen
```

Lösung: dem CT eine feste, freie IP geben (`pct set <CTID> --net0 name=eth0,bridge=vmbr0,ip=<freie-IP>/24,gw=<Router-IP>`) oder im Router eine DHCP-Reservierung setzen.

## Lokaler Test ohne Proxmox

```bash
cd app
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5000
```

Danach `http://localhost:5000/display` und `http://localhost:5000/settings` im Browser öffnen.
