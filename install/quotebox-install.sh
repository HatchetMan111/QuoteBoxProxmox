#!/usr/bin/env bash
# Copyright (c) 2021-2026 community-scripts ORG (Vorlage) / angepasst für QuoteBox
# Author: DEIN-NAME
# License: MIT
# Source: https://github.com/HatchetMan111/QuoteBoxProxmox

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

# WICHTIG: nach dem Push in dein eigenes Repo hier die echte URL eintragen.
REPO_URL="https://github.com/HatchetMan111/QuoteBoxProxmox.git"

msg_info "Installiere Abhängigkeiten"
$STD apt-get install -y python3 python3-venv python3-pip git
msg_ok "Abhängigkeiten installiert"

msg_info "Lade QuoteBox-Anwendung"
mkdir -p /opt/quotebox
git clone -q --depth 1 "$REPO_URL" /opt/quotebox-src
cp -r /opt/quotebox-src/app /opt/quotebox/app
cp /opt/quotebox-src/quotebox.service /etc/systemd/system/quotebox.service
cd /opt/quotebox-src && git rev-parse HEAD > /opt/quotebox_version.txt
cd /
rm -rf /opt/quotebox-src
msg_ok "QuoteBox-Anwendung geladen"

msg_info "Erstelle Python-Umgebung"
python3 -m venv /opt/quotebox/venv
$STD /opt/quotebox/venv/bin/pip install --upgrade pip
$STD /opt/quotebox/venv/bin/pip install -r /opt/quotebox/app/requirements.txt
msg_ok "Python-Umgebung erstellt"

msg_info "Aktiviere QuoteBox-Dienst"
systemctl daemon-reload
systemctl enable -q --now quotebox
msg_ok "QuoteBox-Dienst aktiviert"

msg_info "Prüfe, ob der Dienst läuft"
sleep 2
if ! systemctl is-active --quiet quotebox; then
  msg_error "QuoteBox-Dienst läuft nicht! Vollständiges Log:"
  journalctl -u quotebox --no-pager -n 60
  exit 1
fi
msg_ok "QuoteBox-Dienst läuft"

msg_info "Prüfe Web-UI (HTTP)"
HEALTH_OK=0
for i in $(seq 1 10); do
  if curl -fsS "http://127.0.0.1:5000/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done
if [[ "$HEALTH_OK" -ne 1 ]]; then
  msg_error "Web-UI antwortet nicht auf http://127.0.0.1:5000/health"
  echo "--- journalctl -u quotebox (letzte 60 Zeilen) ---"
  journalctl -u quotebox --no-pager -n 60
  echo "--- curl -v Ausgabe ---"
  curl -v "http://127.0.0.1:5000/health" || true
  exit 1
fi
msg_ok "Web-UI antwortet"

motd_ssh
customize

msg_info "Bereinige"
$STD apt-get -y autoremove
$STD apt-get -y autoclean
msg_ok "Bereinigt"
