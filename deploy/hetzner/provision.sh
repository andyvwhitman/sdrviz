#!/usr/bin/env bash
# Create (or bring up to date) the sdrviz server on Hetzner Cloud, then print its IP for your DNS A record.
#
# Before the first run (one minute, in the console; the API cannot create projects):
#   1. https://console.hetzner.cloud -> New project, e.g. "sdrviz"
#   2. In that project: Security -> API tokens -> Generate API token (Read & Write)
#   3. brew install hcloud
#   4. hcloud context create sdrviz        (paste the token when asked)
#
# Run:   deploy/hetzner/provision.sh
# Safe to run again: anything that already exists is kept, and the firewall rules are refreshed.
#
# Settings (environment variables, all optional):
#   SDRVIZ_NAME      name prefix for every resource          (sdrviz)
#   SDRVIZ_LOCATION  Hetzner location; ash = Ashburn, VA      (ash)
#   SDRVIZ_TYPE      server type; `hcloud server-type list`   (cpx21: 3 vCPU, 4 GB)
#   SDRVIZ_IMAGE     OS image                                 (ubuntu-24.04)
#   SDRVIZ_VOLUME_GB size of the data Volume in GB            (20)
#   SDRVIZ_SSH_KEY   public key file to install               (the first of ~/.ssh/*.pub)
#   SDRVIZ_SSH_FROM  addresses allowed to SSH in, CIDR        (anywhere; login is by key only)

set -euo pipefail

NAME="${SDRVIZ_NAME:-sdrviz}"
LOCATION="${SDRVIZ_LOCATION:-ash}"
TYPE="${SDRVIZ_TYPE:-cpx21}"
IMAGE="${SDRVIZ_IMAGE:-ubuntu-24.04}"
VOLUME_GB="${SDRVIZ_VOLUME_GB:-20}"
SSH_KEY_FILE="${SDRVIZ_SSH_KEY:-$(ls "$HOME"/.ssh/*.pub 2>/dev/null | head -n1)}"

NETWORK="$NAME-net"
FIREWALL="$NAME-fw"
VOLUME="$NAME-data"
SERVER="$NAME"
KEY="$NAME-key"

say() { printf '\n== %s\n' "$*"; }
exists() { hcloud "$1" describe "$2" >/dev/null 2>&1; }  # exists <kind> <name>

# --- preflight -------------------------------------------------------------------------------------------------
command -v hcloud >/dev/null || { echo "hcloud is not installed: brew install hcloud" >&2; exit 1; }
hcloud server-type list >/dev/null 2>&1 || {
  echo "hcloud cannot reach your project. Run: hcloud context create $NAME   (paste the project's API token)" >&2
  exit 1
}
[[ -f "$SSH_KEY_FILE" ]] || { echo "No SSH public key found in ~/.ssh (set SDRVIZ_SSH_KEY=path/to/key.pub)" >&2; exit 1; }
echo "SSH key: $SSH_KEY_FILE"

case "$LOCATION" in  # the private network's zone must match the server's location
  ash) ZONE=us-east ;;
  hil) ZONE=us-west ;;
  sin) ZONE=ap-southeast ;;
  *) ZONE=eu-central ;;
esac

# SSH is open to the internet for now (owner's choice); the server accepts keys only (setup.sh enforces it).
# To narrow it later: SDRVIZ_SSH_FROM=1.2.3.4/32 deploy/hetzner/provision.sh
SSH_FROM="${SDRVIZ_SSH_FROM:-}"
if [[ -n "$SSH_FROM" ]]; then SSH_SOURCES="\"$SSH_FROM\""; else SSH_SOURCES='"0.0.0.0/0", "::/0"'; fi

# --- SSH key ---------------------------------------------------------------------------------------------------
say "SSH key $KEY"
if exists ssh-key "$KEY"; then
  echo "exists"
else
  hcloud ssh-key create --name "$KEY" --public-key-from-file "$SSH_KEY_FILE" --label app="$NAME"
fi

# --- private network -------------------------------------------------------------------------------------------
say "Private network $NETWORK (10.0.0.0/16, zone $ZONE)"
if exists network "$NETWORK"; then
  echo "exists"
else
  hcloud network create --name "$NETWORK" --ip-range 10.0.0.0/16 --label app="$NAME"
  hcloud network add-subnet "$NETWORK" --network-zone "$ZONE" --type cloud --ip-range 10.0.0.0/24
fi

# --- firewall: web open to all, SSH only from you --------------------------------------------------------------
say "Firewall $FIREWALL (80, 443 from anywhere; 22 from ${SSH_FROM:-anywhere}, key only)"
exists firewall "$FIREWALL" || hcloud firewall create --name "$FIREWALL" --label app="$NAME"
RULES="$(mktemp)"
trap 'rm -f "$RULES"' EXIT
cat >"$RULES" <<EOF
[
  {"direction": "in", "protocol": "tcp", "port": "80",  "source_ips": ["0.0.0.0/0", "::/0"], "description": "http (certificates, redirect)"},
  {"direction": "in", "protocol": "tcp", "port": "443", "source_ips": ["0.0.0.0/0", "::/0"], "description": "https and nodes"},
  {"direction": "in", "protocol": "udp", "port": "443", "source_ips": ["0.0.0.0/0", "::/0"], "description": "http/3"},
  {"direction": "in", "protocol": "tcp", "port": "22",  "source_ips": [$SSH_SOURCES],      "description": "ssh, key only"},
  {"direction": "in", "protocol": "icmp",               "source_ips": ["0.0.0.0/0", "::/0"], "description": "ping"}
]
EOF
hcloud firewall replace-rules "$FIREWALL" --rules-file "$RULES" >/dev/null
echo "rules set"

# --- data volume -----------------------------------------------------------------------------------------------
say "Volume $VOLUME (${VOLUME_GB} GB, $LOCATION)"
if exists volume "$VOLUME"; then
  echo "exists"
else
  hcloud volume create --name "$VOLUME" --size "$VOLUME_GB" --location "$LOCATION" --format ext4 --label app="$NAME"
fi

# --- server ----------------------------------------------------------------------------------------------------
say "Server $SERVER ($TYPE, $IMAGE, $LOCATION)"
if exists server "$SERVER"; then
  echo "exists"
else
  hcloud server create --name "$SERVER" --type "$TYPE" --image "$IMAGE" --location "$LOCATION" \
    --ssh-key "$KEY" --network "$NETWORK" --firewall "$FIREWALL" \
    --volume "$VOLUME" --automount --label app="$NAME" \
    || { echo "Server create failed. If the type is not offered in $LOCATION, pick one from: hcloud server-type list" >&2; exit 1; }
fi

# --- result ----------------------------------------------------------------------------------------------------
IPV4="$(hcloud server ip "$SERVER")"
IPV6="$(hcloud server ip -6 "$SERVER" 2>/dev/null || true)"
cat <<EOF

Done.

  Server IPv4: $IPV4
  Server IPv6: ${IPV6:-none}

DNS: at your domain's DNS provider add
  A     <subdomain>   $IPV4
  AAAA  <subdomain>   ${IPV6:-(skip)}

Then install sdrviz on it (wait a minute for the server to boot):
  scp deploy/server/setup.sh root@$IPV4:
  ssh root@$IPV4 'bash setup.sh sdrviz.<yourdomain>'
EOF
