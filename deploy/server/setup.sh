#!/usr/bin/env bash
# Install or update sdrviz on a fresh Ubuntu 24.04 server (made by deploy/hetzner/provision.sh).
#
#   scp deploy/server/setup.sh root@<ip>:
#   ssh root@<ip> 'bash setup.sh sdrviz.example.com'
#
# First run: turns off SSH passwords (keys only), installs Docker and git, puts Docker's storage on the Hetzner Volume (so the database and
# certificates survive a server rebuild), clones the repo, writes deploy/.env with a generated password,
# and starts the stack. Running it again updates: pulls the latest code and rebuilds. The .env is kept.
#
# Settings (environment variables, all optional):
#   SDRVIZ_REPO      git URL     (https://github.com/andyvwhitman/sdrviz.git)
#   SDRVIZ_BRANCH    branch      (main)
#   SDRVIZ_PASSWORD  viewer password on first run (default: a random one, printed at the end)

set -euo pipefail

DOMAIN="${1:-}"
REPO="${SDRVIZ_REPO:-https://github.com/andyvwhitman/sdrviz.git}"
BRANCH="${SDRVIZ_BRANCH:-main}"
APP=/opt/sdrviz
ENV_FILE="$APP/deploy/.env"

say() { printf '\n== %s\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
[[ -n "$DOMAIN" ]] || { echo "Usage: bash setup.sh <domain>   e.g. bash setup.sh sdrviz.example.com" >&2; exit 1; }

# --- the data volume ---------------------------------------------------------------------------------------------
VOLUME_DIR="$(findmnt -rn -o TARGET | grep '^/mnt/HC_Volume_' | head -n1 || true)"
if [[ -z "$VOLUME_DIR" ]]; then
  echo "No Hetzner Volume mounted under /mnt/HC_Volume_*. Attach one with automount, or set up storage by hand." >&2
  exit 1
fi
say "Data volume: $VOLUME_DIR"

# --- packages ------------------------------------------------------------------------------------------------------
say "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git openssl docker.io docker-compose-v2 unattended-upgrades

# security updates install themselves
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# --- SSH: keys only (port 22 is open to the internet) --------------------------------------------------------------
# sshd uses the first value it reads, so this file sorts first in sshd_config.d.
cat >/etc/ssh/sshd_config.d/00-sdrviz.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl reload ssh

# --- Docker keeps everything (images, the app's data, certificates) on the volume ----------------------------------
WANT="{\"data-root\": \"$VOLUME_DIR/docker\"}"
if [[ "$(cat /etc/docker/daemon.json 2>/dev/null || true)" != "$WANT" ]]; then
  say "Docker storage -> $VOLUME_DIR/docker"
  mkdir -p "$VOLUME_DIR/docker"
  echo "$WANT" >/etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null

# --- code ----------------------------------------------------------------------------------------------------------
if [[ -d "$APP/.git" ]]; then
  say "Updating $APP ($BRANCH)"
  git -C "$APP" fetch -q origin
  git -C "$APP" checkout -q "$BRANCH"
  git -C "$APP" pull -q --ff-only origin "$BRANCH"
else
  say "Cloning $REPO into $APP"
  git clone -q --branch "$BRANCH" "$REPO" "$APP"
fi
echo "at $(git -C "$APP" log --oneline -1)"
[[ -f "$APP/deploy/compose.yml" ]] || { echo "deploy/compose.yml is missing on $BRANCH: push the deploy files first." >&2; exit 1; }

# --- settings (first run only) -------------------------------------------------------------------------------------
NEW_PASSWORD=""
if [[ ! -f "$ENV_FILE" ]]; then
  say "Writing $ENV_FILE"
  NEW_PASSWORD="${SDRVIZ_PASSWORD:-$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-24)}"
  SECRET="$(openssl rand -base64 48 | tr -d '/+=' | cut -c1-48)"
  umask 077
  cat >"$ENV_FILE" <<EOF
SDRVIZ_DOMAIN=$DOMAIN
SDRVIZ_PUBLIC_URL=https://$DOMAIN
SDRVIZ_PASSWORD=$NEW_PASSWORD
SDRVIZ_SECRET=$SECRET
SDRVIZ_RTLTCP_HOST=
SDRVIZ_HTTP_PORT=80
SDRVIZ_HTTPS_PORT=443
EOF
  umask 022
else
  echo "Keeping the existing $ENV_FILE"
fi

# --- DNS check (Caddy can only get a certificate once the name points here) -----------------------------------------
MY_IP="$(hostname -I | awk '{print $1}')"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)"
if [[ "$DNS_IP" != "$MY_IP" ]]; then
  echo
  echo "Note: $DOMAIN resolves to '${DNS_IP:-nothing}', this server is $MY_IP."
  echo "      Add the A record; Caddy retries and gets the certificate once DNS points here."
fi

# --- start ---------------------------------------------------------------------------------------------------------
say "Building and starting (the first build takes a few minutes)"
cd "$APP/deploy"
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps

cat <<EOF

sdrviz is running.
  Site:      https://$DOMAIN
EOF
if [[ -n "$NEW_PASSWORD" ]]; then
  cat <<EOF
  Password:  $NEW_PASSWORD
             (shown once; it is also in $ENV_FILE, readable by root only)
EOF
fi
cat <<EOF
  Update:    ssh root@$MY_IP 'bash setup.sh $DOMAIN'
  Logs:      ssh root@$MY_IP 'cd $APP/deploy && docker compose logs -f --tail 100'
EOF
