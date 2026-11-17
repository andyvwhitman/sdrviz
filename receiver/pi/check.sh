#!/usr/bin/env bash
# sdrviz receiver health check. Prints a short report; paste it back to Claude.
# Installed as /usr/local/bin/sdrviz-check. No sudo needed.
set -uo pipefail

ENV_FILE=/etc/sdrviz/rtltcp.env
SERVICE=sdrviz-rtltcp
PORT=1234
[[ -r "$ENV_FILE" ]] && PORT="$(grep -E '^RTLTCP_PORT=' "$ENV_FILE" | cut -d= -f2 || echo 1234)"

ok() { printf '  [ OK ] %s\n' "$*"; }
bad() { printf '  [FAIL] %s\n' "$*"; }
info() { printf '         %s\n' "$*"; }

echo "---- sdrviz receiver check ($(date '+%Y-%m-%d %H:%M:%S')) ----"
info "host:   $(hostname) · $(tr -d '\0' < /proc/device-tree/model 2>/dev/null)"
info "os:     $(. /etc/os-release && echo "$PRETTY_NAME") · $(uname -r) · $(uname -m)"
info "ip:     $(hostname -I 2>/dev/null)"

if lsusb | grep -Eiq '0bda:(2838|2832)'; then
  ok "dongle: $(lsusb | grep -Ei '0bda:(2838|2832)' | cut -d' ' -f6-)"
else
  bad "dongle: no RTL-SDR on USB"
fi

if lsmod | grep -q '^dvb_usb_rtl28xxu'; then
  bad "TV driver dvb_usb_rtl28xxu is loaded; replug the dongle or reboot"
else
  ok "TV driver not loaded"
fi

if command -v rtl_tcp >/dev/null; then
  ok "rtl_tcp: $(command -v rtl_tcp)"
else
  bad "rtl_tcp not installed"
fi

if systemctl is-active --quiet "$SERVICE"; then
  ok "service $SERVICE is running (since $(systemctl show -p ActiveEnterTimestamp --value "$SERVICE"))"
else
  bad "service $SERVICE is $(systemctl is-active "$SERVICE")"
fi

if systemctl is-active --quiet "$SERVICE"; then
  pid="$(systemctl show -p MainPID --value "$SERVICE")"
  rss_kb="$(awk '/^VmRSS:/ {print $2}' "/proc/$pid/status" 2>/dev/null)"
  restarts="$(systemctl show -p NRestarts --value "$SERVICE")"
  limit="$(systemctl show -p MemoryMax --value "$SERVICE")"
  if [[ -n "$rss_kb" ]]; then
    if (( rss_kb > 400000 )); then
      bad "memory: rtl_tcp uses $((rss_kb / 1024)) MB (limit ${limit}); it should stay under ~100 MB"
    else
      ok "memory: rtl_tcp uses $((rss_kb / 1024)) MB (limit ${limit})"
    fi
  fi
  info "restarts since the service was started: ${restarts:-unknown}"
fi

if systemctl list-unit-files sdrviz-node.service >/dev/null 2>&1 && systemctl is-enabled --quiet sdrviz-node 2>/dev/null; then
  if systemctl is-active --quiet sdrviz-node; then
    ok "service sdrviz-node is running ($(command -v sdrviz-node >/dev/null && sdrviz-node status 2>&1 | grep -E '^uplink' || echo 'no status'))"
  else
    bad "service sdrviz-node is $(systemctl is-active sdrviz-node)"
  fi
fi

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  ok "listening on port $PORT"
else
  bad "nothing listening on port $PORT"
fi

if command -v vcgencmd >/dev/null; then
  info "temp:   $(vcgencmd measure_temp | cut -d= -f2)"
  throttled="$(vcgencmd get_throttled | cut -d= -f2)"
  if [[ "$throttled" == "0x0" ]]; then
    ok "power: no under-voltage or throttling"
  else
    bad "power/throttle flags $throttled (weak power supply? the Pi 5 wants a 5 A supply for full USB power)"
  fi
fi

[[ -r "$ENV_FILE" ]] && info "settings: $(grep -E '^RTLTCP_' "$ENV_FILE" | tr '\n' ' ')"

echo "  recent service log:"
journalctl -u "$SERVICE" -n 8 --no-pager 2>/dev/null | sed 's/^/    /' \
  || echo "    (journal needs sudo: sudo journalctl -u $SERVICE -n 20)"
echo "---- end ----"
