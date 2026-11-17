#!/usr/bin/env bash
# Install the sdrviz-node agent on a Pi that already runs the rtl_tcp service (setup.sh).
#
# Usage (on the Pi, as root):
#   sudo bash install-node.sh                      # clone the repo into /opt/sdrviz-node/src, make the venv
#   sudo bash install-node.sh --source ~/sdrviz    # use a checkout that is already there
#   sudo bash install-node.sh --repo URL --branch NAME
#
# What it does: a git checkout, a Python venv in /opt/sdrviz-node/venv with the agent's dependencies
# (backend/requirements-node.txt), the sdrviz-node command, /etc/sdrviz-node/ and the systemd unit.
# It starts the service only if the node is already enrolled. Safe to run again (it updates the checkout
# and the venv and keeps /etc/sdrviz-node). Then enroll with a key from Settings > Nodes > Add node:
#   sudo -u sdrviz sdrviz-node enroll 'sdrviz-node1....'   (or put the key in /etc/sdrviz-node/pi.key)
#   sudo systemctl restart sdrviz-node
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE=/opt/sdrviz-node
SRC="$BASE/src"
VENV="$BASE/venv"
CONFIG=/etc/sdrviz-node
UNIT=/etc/systemd/system/sdrviz-node.service
COMMAND=/usr/local/bin/sdrviz-node
REPO=https://github.com/andyvwhitman/sdrviz.git
BRANCH=main
USE_SOURCE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) USE_SOURCE="$(realpath "$2")"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash install-node.sh" >&2
  exit 1
fi

step "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv git

step "User and directories"
id sdrviz >/dev/null 2>&1 || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin sdrviz
install -d -o sdrviz -g sdrviz -m 0750 "$CONFIG"
install -d -m 0755 "$BASE"

step "Source"
if [[ -n "$USE_SOURCE" ]]; then
  SRC="$USE_SOURCE"
  note "using the checkout at $SRC"
elif [[ -d "$SRC/.git" ]]; then
  git -C "$SRC" fetch --quiet origin "$BRANCH"
  git -C "$SRC" checkout --quiet "$BRANCH"
  git -C "$SRC" merge --ff-only --quiet "origin/$BRANCH"
  note "updated $SRC to $(git -C "$SRC" rev-parse --short HEAD)"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$SRC"
  note "cloned $REPO to $SRC at $(git -C "$SRC" rev-parse --short HEAD)"
fi
[[ -f "$SRC/backend/requirements-node.txt" ]] || { echo "No backend/requirements-node.txt in $SRC" >&2; exit 1; }
# The service user reads the code; it must be able to traverse the path.
chmod -R a+rX "$SRC/backend" 2>/dev/null || true

step "Python environment"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$SRC/backend/requirements-node.txt"
"$VENV/bin/python" -c "import numpy, av, websockets, pydantic; print('    numpy', numpy.__version__, 'PyAV', av.__version__)"

step "The sdrviz-node command"
cat > "$COMMAND" <<WRAPPER
#!/usr/bin/env bash
# sdrviz-node run|enroll <key|file>|status  (runs as the sdrviz user so the files it writes belong to it)
cd "$SRC/backend"
export SDRVIZ_NODE_DIR="$CONFIG"
if [[ \$EUID -eq 0 ]]; then
  exec runuser -u sdrviz -- "$VENV/bin/python" -m app.node.agent "\$@"
fi
exec "$VENV/bin/python" -m app.node.agent "\$@"
WRAPPER
chmod 0755 "$COMMAND"

step "systemd unit"
sed "s#/opt/sdrviz-node/src#$SRC#g" "$HERE/sdrviz-node.service" > "$UNIT"
if [[ "$SRC" == /home/* ]]; then
  sed -i 's/^ProtectHome=yes/ProtectHome=read-only/' "$UNIT"
  note "Warning: $SRC is under /home; the sdrviz user must be able to read it (home directories are often 0750)."
  note "The default checkout in /opt/sdrviz-node/src avoids that."
fi
chmod 0644 "$UNIT"
systemctl daemon-reload
systemctl enable sdrviz-node >/dev/null 2>&1

step "Starting"
if [[ -f "$CONFIG/node.json" || -n "$(ls "$CONFIG"/*.key 2>/dev/null)" ]]; then
  systemctl restart sdrviz-node
  sleep 2
  sdrviz-node status || true
else
  note "Not enrolled yet, so the service is enabled but not started."
  note "Create a node in Settings > Nodes > Add node, then:"
  note "  sudo -u sdrviz sdrviz-node enroll 'sdrviz-node1....'"
  note "  sudo systemctl restart sdrviz-node"
fi
