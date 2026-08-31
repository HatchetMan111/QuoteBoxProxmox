#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG (Vorlage) / angepasst für QuoteBox
# Author: HatchetMan111
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

REPO_URL="https://github.com/HatchetMan111/QuoteBoxProxmox.git"

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/quotebox ]]; then
    msg_error "Keine ${APP}-Installation gefunden!"
    exit
  fi

  msg_info "Lade aktuellen Stand aus dem Repo"
  rm -rf /opt/quotebox-src
  if ! $STD git clone -q --depth 1 "$REPO_URL" /opt/quotebox-src; then
    msg_error "Konnte ${REPO_URL} nicht klonen – Abbruch, bestehende Installation bleibt unverändert."
    exit 1
  fi
  if [[ ! -d /opt/quotebox-src/app ]]; then
    msg_error "Repo-Struktur unerwartet (app/ fehlt) – Abbruch, bestehende Installation bleibt unverändert."
    rm -rf /opt/quotebox-src
    exit 1
  fi
  msg_ok "Aktueller Stand geladen"

  msg_info "Aktualisiere ${APP} (eigene Sprüche und Einstellungen bleiben erhalten)"
  systemctl stop quotebox

  # Nutzer-Daten (quotes.json, settings.json) sichern, bevor das App-Verzeichnis ersetzt wird
  DATA_BACKUP=""
  if [[ -d /opt/quotebox/app/data ]]; then
    DATA_BACKUP=$(mktemp -d /tmp/quotebox-data.XXXXXX)
    cp -a /opt/quotebox/app/data/. "$DATA_BACKUP/"
  fi

  rm -rf /opt/quotebox/app
  cp -r /opt/quotebox-src/app /opt/quotebox/app
  if [[ -n "$DATA_BACKUP" ]]; then
    cp -a "$DATA_BACKUP/." /opt/quotebox/app/data/
    rm -rf "$DATA_BACKUP"
  fi

  cp /opt/quotebox-src/quotebox.service /etc/systemd/system/quotebox.service
  git -C /opt/quotebox-src rev-parse HEAD > /opt/quotebox_version.txt
  rm -rf /opt/quotebox-src

  $STD /opt/quotebox/venv/bin/pip install --no-cache-dir -r /opt/quotebox/app/requirements.txt

  # Falls der Dienstbenutzer noch nicht existiert (altes Setup), nachziehen
  if ! id -u quotebox >/dev/null 2>&1; then
    useradd --system --home-dir /opt/quotebox --shell /usr/sbin/nologin quotebox
  fi
  chown -R quotebox:quotebox /opt/quotebox

  systemctl daemon-reload
  systemctl enable -q --now quotebox
  msg_ok "Aktualisiert auf $(cut -c1-7 /opt/quotebox_version.txt)"

  msg_info "Prüfe Dienst nach dem Update"
  sleep 2
  if ! systemctl is-active --quiet quotebox; then
    msg_error "${APP}-Dienst läuft nach dem Update nicht! Vollständiges Log:"
    journalctl -u quotebox --no-pager -n 60
    exit 1
  fi
  HEALTH_OK=0
  for i in $(seq 1 10); do
    if curl -fsS "http://127.0.0.1:5000/health" >/dev/null 2>&1; then
      HEALTH_OK=1
      break
    fi
    sleep 1
  done
  if [[ "$HEALTH_OK" -ne 1 ]]; then
    msg_error "Web-UI antwortet nach dem Update nicht auf http://127.0.0.1:5000/health"
    echo "--- journalctl -u quotebox (letzte 60 Zeilen) ---"
    journalctl -u quotebox --no-pager -n 60
    exit 1
  fi
  msg_ok "Dienst läuft, Web-UI antwortet"

  echo -e "${INFO}${YW} Anzeige fürs Tablet:${CL}"
  echo -e "${TAB}${GATEWAY}${BGN}http://$(hostname -I | awk '{print $1}'):5000/display${CL}"
  exit
}

start
build_container
description

msg_info "Prüfe Erreichbarkeit von außen (vom Proxmox-Host aus)"
HEALTH_URL="http://${IP}:5000/health"
HTTP_CODE=""
CURL_RC=0
EXTERNAL_OK=0
for _ in 1 2 3 4 5; do
  # --noproxy: ein auf dem Host gesetzter http_proxy wuerde LAN-Requests verfaelschen
  HTTP_CODE="$(curl --noproxy '*' -s -m 5 -o /tmp/quotebox-health.out -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)"
  CURL_RC=$?
  if [[ "$HTTP_CODE" == "200" ]]; then
    EXTERNAL_OK=1
    break
  fi
  sleep 2
done

if [[ "$EXTERNAL_OK" -ne 1 ]]; then
  msg_error "${HEALTH_URL} antwortet nicht wie erwartet (HTTP: ${HTTP_CODE:-keiner}, curl-rc: ${CURL_RC:-?})."
  echo -e "${YW}Automatische Diagnose:${CL}"

  # 1) Gehoert die IP ueberhaupt noch zu diesem CT?
  CT_IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "$CT_IP" && "$CT_IP" != "${IP:-}" ]]; then
    echo -e "  ⚠️  IP geändert: CT meldet jetzt ${BGN}${CT_IP}${YW} (geprüft wurde ${IP})."
    echo -e "     -> Richtige URL: ${BGN}http://${CT_IP}:5000/display${CL}"
  fi

  # 2) IP-Konflikt? ARP-MAC des Hosts mit der CT-MAC vergleichen
  CT_MAC="$(pct config "$CTID" 2>/dev/null | grep -oE 'hwaddr=[0-9A-Fa-f:]+' | head -1 | cut -d= -f2 | tr '[:upper:]' '[:lower:]')"
  ARP_MAC="$(ip neigh show "${IP:-}" 2>/dev/null | awk '{print $5}' | head -1 | tr '[:upper:]' '[:lower:]')"
  if [[ -n "$CT_MAC" && -n "$ARP_MAC" && "$CT_MAC" != "$ARP_MAC" ]]; then
    echo -e "  ⚠️  IP-KONFLIKT: Unter ${IP} antwortet MAC ${ARP_MAC}, der CT hat aber ${CT_MAC}."
    echo -e "     -> Ein anderes Gerät (z. B. NAS) belegt diese IP! CT auf feste freie IP umstellen"
    echo -e "        oder im Router per DHCP-Reservierung fest zuordnen."
  elif [[ -n "${HTTP_CODE:-}" && "$HTTP_CODE" != "000" && -z "$ARP_MAC" ]]; then
    echo -e "  ⚠️  Antwort kam nicht direkt vom Gerät (kein ARP-Eintrag für ${IP})."
    echo -e "     -> Prüfe, ob der Host einen Proxy erzwingt: env | grep -i proxy"
  fi

  # 3) Was genau hat geantwortet?
  if [[ -n "${HTTP_CODE:-}" && "$HTTP_CODE" != "000" ]]; then
    SERVER_LINE="$(curl --noproxy '*' -s -m 5 -D - -o /dev/null "$HEALTH_URL" 2>/dev/null | tr -d '\r' | grep -iE '^(server|x-powered-by):' | head -2 || true)"
    BODY_HEAD="$(head -c 100 /tmp/quotebox-health.out 2>/dev/null | tr '\n' ' ' | tr -s ' ')"
    echo -e "  ⚠️  Port 5000 antwortet mit HTTP ${HTTP_CODE}, aber NICHT mit QuoteBox. ${SERVER_LINE:-${BODY_HEAD:+Antwort: ${BODY_HEAD}}}"
    echo -e "     -> Typisch für einen anderen Dienst auf derselben IP (Konflikt, siehe oben)."
    echo -e "     -> Vergleich direkt im CT: pct exec ${CTID} -- curl -s http://127.0.0.1:5000/health"
  else
    case "${CURL_RC:-0}" in
      7)
        echo -e "  ⚠️  Verbindung abgelehnt – im CT lauscht gerade nichts auf Port 5000."
        echo -e "     pct exec ${CTID} -- systemctl status quotebox"
        echo -e "     pct exec ${CTID} -- journalctl -u quotebox -n 60 --no-pager"
        echo -e "     pct exec ${CTID} -- ss -tlnp"
        ;;
      28)
        echo -e "  ⚠️  Zeitüberschreitung – typisch für eine blockierende Firewall."
        echo -e "     Prüfe Datacenter -> Firewall / Node -> Firewall / CT ${CTID} -> Firewall"
        echo -e "     -> falls aktiv: Regel für Port 5000/tcp (eingehend) hinzufügen, oder Firewall für diese CT deaktivieren."
        ;;
      *)
        echo -e "  ⚠️  Kein HTTP erreichbar. Der Reihe nach:"
        echo -e "     pct exec ${CTID} -- systemctl status quotebox"
        echo -e "     pct exec ${CTID} -- journalctl -u quotebox -n 60 --no-pager"
        echo -e "     pct exec ${CTID} -- ss -tlnp"
        echo -e "     curl -v ${HEALTH_URL}"
        ;;
    esac
  fi

  echo -e "${YW}Hinweis: Die URLs unten sind aktuell evtl. nicht erreichbar – siehe Diagnose oben.${CL}"
else
  msg_ok "Von außen erreichbar"
fi

msg_ok "Fertig eingerichtet!\n"
echo -e "${CREATING}${GN}${APP} wurde erfolgreich installiert!${CL}"
echo -e "${INFO}${YW} Anzeige fürs Tablet (Kiosk/Vollbild):${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:5000/display${CL}"
echo -e "${INFO}${YW} Einstellungen (Kategorien, Intervall, Uhr):${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:5000/settings${CL}"
