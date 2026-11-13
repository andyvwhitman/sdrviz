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
