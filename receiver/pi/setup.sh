#!/usr/bin/env bash
# sdrviz receiver setup for a Raspberry Pi with an RTL-SDR dongle.
#
# Installs the RTL-SDR drivers, stops Linux from grabbing the dongle as a TV tuner,
# and runs rtl_tcp as an always-on service that streams IQ to the sdrviz backend.
#
# Usage (on the Pi, from this folder):
#   sudo bash setup.sh              # normal install; auto-detects an RTL-SDR Blog V4
#   sudo bash setup.sh --blog-driver   # force the RTL-SDR Blog driver build
#   sudo bash setup.sh --stock-driver  # never build the Blog driver
#
# Safe to run again: every step checks before it changes anything.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLACKLIST=/etc/modprobe.d/sdrviz-rtlsdr-blacklist.conf
UDEV_RULE=/etc/udev/rules.d/60-sdrviz-rtlsdr.rules
ENV_FILE=/etc/sdrviz/rtltcp.env
SERVICE=sdrviz-rtltcp
BLOG_SRC=/opt/sdrviz/src/rtl-sdr-blog
DRIVER_MODE=auto

for arg in "$@"; do
  case "$arg" in
    --blog-driver) DRIVER_MODE=blog ;;
    --stock-driver) DRIVER_MODE=stock ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash setup.sh" >&2
  exit 1
fi

step "Checking the system"
note "$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo 'unknown model')"
note "$(. /etc/os-release && echo "$PRETTY_NAME") · $(uname -m)"
if [[ "$(uname -m)" != "aarch64" ]]; then
  note "Warning: not a 64-bit OS. The 64-bit Raspberry Pi OS is recommended."
fi

step "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq rtl-sdr usbutils git cmake build-essential pkg-config libusb-1.0-0-dev

step "Stopping the DVB TV driver from claiming the dongle"
cat > "$BLACKLIST" <<'EOF'
# sdrviz: let rtl-sdr use the dongle instead of the DVB-T TV driver.
blacklist dvb_usb_rtl28xxu
blacklist rtl2832
blacklist rtl2832_sdr
blacklist rtl2830
EOF
for mod in rtl2832_sdr dvb_usb_rtl28xxu rtl2832 rtl2830; do
  modprobe -r "$mod" 2>/dev/null || true
done
if lsmod | grep -q '^dvb_usb_rtl28xxu'; then
  note "The TV driver is still loaded. Unplug and replug the dongle (or reboot) after setup."
else
  note "TV driver not loaded."
fi

step "Allowing the sdrviz service to use the dongle"
cat > "$UDEV_RULE" <<'EOF'
# sdrviz: RTL2832U dongles are usable by the plugdev group.
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2838", GROUP="plugdev", MODE="0660"
SUBSYSTEMS=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2832", GROUP="plugdev", MODE="0660"
EOF
udevadm control --reload-rules
udevadm trigger --subsystem-match=usb

step "Looking for the dongle"
if lsusb | grep -Eiq '0bda:(2838|2832)'; then
  note "$(lsusb | grep -Ei '0bda:(2838|2832)')"
else
  note "No RTL-SDR found on USB. Check that it's plugged in; setup will continue anyway."
fi

# The RTL-SDR Blog V4 uses an R828D tuner that needs the Blog fork of the driver.
needs_blog_driver() {
  case "$DRIVER_MODE" in
    blog) return 0 ;;
    stock) return 1 ;;
  esac
  systemctl stop "$SERVICE" 2>/dev/null || true   # rtl_test needs the dongle to itself
  timeout 6 rtl_test -t 2>&1 | grep -q 'R828D'
}

step "Choosing the driver"
if needs_blog_driver; then
  note "R828D tuner (RTL-SDR Blog V4) found: building the RTL-SDR Blog driver."
  apt-get purge -y -qq rtl-sdr 'librtlsdr*' || true
  if [[ -d "$BLOG_SRC/.git" ]]; then
    git -C "$BLOG_SRC" pull --ff-only -q
  else
    mkdir -p "$(dirname "$BLOG_SRC")"
    git clone -q --depth 1 https://github.com/rtlsdrblog/rtl-sdr-blog "$BLOG_SRC"
  fi
  cmake -S "$BLOG_SRC" -B "$BLOG_SRC/build" -DINSTALL_UDEV_RULES=ON -DDETACH_KERNEL_DRIVER=ON > /dev/null
  cmake --build "$BLOG_SRC/build" -j "$(nproc)" > /dev/null
  cmake --install "$BLOG_SRC/build" > /dev/null
  ldconfig
  note "Installed: $(command -v rtl_tcp)"
else
  note "Using the stock Debian driver: $(command -v rtl_tcp)"
fi

step "Creating the sdrviz service user"
if ! id sdrviz >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin --groups plugdev sdrviz
  note "Created user sdrviz."
else
  usermod -aG plugdev sdrviz
  note "User sdrviz already exists."
fi

step "Installing the rtl_tcp service"
mkdir -p /etc/sdrviz /opt/sdrviz
if [[ -f "$ENV_FILE" ]]; then
  note "Keeping your existing settings in $ENV_FILE."
else
  install -m 0644 "$HERE/sdrviz-rtltcp.env" "$ENV_FILE"
  note "Settings: $ENV_FILE"
fi
install -m 0755 "$HERE/sdrviz-rtltcp-run" /usr/local/bin/sdrviz-rtltcp-run
install -m 0755 "$HERE/check.sh" /usr/local/bin/sdrviz-check
install -m 0644 "$HERE/README.md" /opt/sdrviz/README.md
install -m 0644 "$HERE/sdrviz-rtltcp.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable --now "$SERVICE" > /dev/null 2>&1
systemctl restart "$SERVICE"
sleep 2

step "Done. Health check:"
/usr/local/bin/sdrviz-check
