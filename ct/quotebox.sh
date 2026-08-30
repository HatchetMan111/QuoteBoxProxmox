#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG (Vorlage) / angepasst für QuoteBox
# Author: DEIN-NAME
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/HatchetMan111/QuoteBoxProxmox

APP="QuoteBox"
var_tags="${var_tags:-display;quotes}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-512}"
var_disk="${var_disk:-4}"
var_os="${var_os:-debian}"
var_version="${var_version:-12}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/quotebox ]]; then
    msg_error "Keine ${APP}-Installation gefunden!"
    exit
  fi

  msg_info "Aktualisiere ${APP}"
  REPO_URL="https://github.com/HatchetMan111/QuoteBoxProxmox.git"
  rm -rf /opt/quotebox-src
  git clone -q --depth 1 "$REPO_URL" /opt/quotebox-src

  systemctl stop quotebox
  rm -rf /opt/quotebox/app
  cp -r /opt/quotebox-src/app /opt/quotebox/app
  cp /opt/quotebox-src/quotebox.service /etc/systemd/system/quotebox.service
  cd /opt/quotebox-src && git rev-parse HEAD > /opt/quotebox_version.txt
  cd /
  rm -rf /opt/quotebox-src

  $STD /opt/quotebox/venv/bin/pip install -r /opt/quotebox/app/requirements.txt
  systemctl daemon-reload
  systemctl enable -q --now quotebox
  msg_ok "Aktualisiert auf $(cat /opt/quotebox_version.txt | cut -c1-7)"
  exit
}

start
build_container
description

msg_info "Prüfe Erreichbarkeit von außen (vom Proxmox-Host aus)"
EXTERNAL_OK=0
for i in $(seq 1 10); do
  if curl -fsS -m 3 "http://${IP}:5000/health" >/dev/null 2>&1; then
    EXTERNAL_OK=1
    break
  fi
  sleep 1
done

if [[ "$EXTERNAL_OK" -ne 1 ]]; then
  msg_error "http://${IP}:5000/health antwortet NICHT vom Host aus (Container selbst meldete beim Setup Erfolg)."
  echo -e "${YW}Das ist so gut wie immer eine Firewall/Netzwerk-Frage, keine App-Frage. Prüfe der Reihe nach:${CL}"
  echo -e "  1) Proxmox-Firewall aktiv? Datacenter -> Firewall / Node -> Firewall / CT ${CTID} -> Firewall"
  echo -e "     -> falls aktiv: Regel für Port 5000/tcp (eingehend) hinzufügen, oder Firewall für diese CT deaktivieren."
  echo -e "  2) Läuft der Dienst gerade wirklich?"
  echo -e "     pct exec ${CTID} -- systemctl status quotebox"
  echo -e "     pct exec ${CTID} -- journalctl -u quotebox -n 60 --no-pager"
  echo -e "  3) Lauscht der Port korrekt auf 0.0.0.0?"
  echo -e "     pct exec ${CTID} -- ss -tlnp"
  echo -e "  4) Direkt vom Host aus testen:"
  echo -e "     curl -v http://${IP}:5000/health"
else
  msg_ok "Von außen erreichbar"
fi

msg_ok "Fertig eingerichtet!\n"
echo -e "${CREATING}${GN}${APP} wurde erfolgreich installiert!${CL}"
echo -e "${INFO}${YW} Anzeige fürs Tablet (Kiosk/Vollbild):${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:5000/display${CL}"
echo -e "${INFO}${YW} Einstellungen (Kategorien, Intervall, Uhr):${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:5000/settings${CL}"
