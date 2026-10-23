# Deployment

Target: Raspberry Pi 5 (8 GB), Raspberry Pi OS 64-bit, native Python virtual
environment and systemd. macOS launchd and Docker are later options.

For a hardened deployment, run the service under a dedicated `bbot` user and
keep the process on loopback behind a TLS reverse proxy (Caddy or nginx) and/or
Tailscale.

## Install

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip git

sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin bbot
sudo mkdir -p /opt/b-bot-advanced
sudo chown bbot:bbot /opt/b-bot-advanced
sudo -u bbot git clone <repository> /opt/b-bot-advanced
cd /opt/b-bot-advanced/B-BOT-Advanced/backend

sudo -u bbot python3 -m venv .venv
sudo -u bbot .venv/bin/pip install --upgrade pip
sudo -u bbot .venv/bin/pip install -r requirements.lock
sudo -u bbot .venv/bin/pip install -e . --no-deps
```

`requirements.lock` pins every runtime dependency. CI runs `pip-audit` against
it; regenerate the lock after dependency updates and review the diff.

## Configure

```bash
sudo install -d -m 700 -o bbot -g bbot /etc/b-bot-advanced
sudo install -m 600 -o bbot -g bbot .env.example /etc/b-bot-advanced/b-bot.env
sudo -u bbot cp config.yaml.example config.yaml
sudo chmod 600 config.yaml
```

Set at minimum:

- `B_BOT_AUTH_TOKEN` — a long random household token.
- `B_BOT_LLM_BASE_URL` and `B_BOT_LLM_MODEL` — the inference machine.
- `B_BOT_TIMEZONE` — defaults to `America/Argentina/Buenos_Aires`; reminder and
  chore recurrences use this zone.
- `B_BOT_HOST` — keep `127.0.0.1` unless a reverse proxy or Tailscale fronts the Pi.

Generate a token with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Token rotation (no downtime)

1. Move the current value to `B_BOT_AUTH_TOKEN_PREVIOUS`.
2. Set a new `B_BOT_AUTH_TOKEN`.
3. Restart the service; both tokens work during the window.
4. Update clients, then clear `B_BOT_AUTH_TOKEN_PREVIOUS` and restart again.

Both values are validated at startup and compared in constant time.

### Transport

Use `https://` for the LLM/STT endpoints. Non-loopback plaintext HTTP is
rejected at startup; set `B_BOT_ALLOW_INSECURE_TRANSPORT=true` only for a
trusted, isolated VLAN. Prefer WireGuard/Tailscale for inference traffic and do
not disable TLS verification.

Interactive API docs are disabled by default. `B_BOT_DOCS_ENABLED=true` is for
loopback development only.

## Run manually

```bash
cd /opt/b-bot-advanced/B-BOT-Advanced/backend
. .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The backend also serves the static frontend at `/` with CSP and other security
headers. Open `http://127.0.0.1:8000/` rather than the HTML file directly so the
headers apply.

Health check: `curl http://127.0.0.1:8000/health`.

## systemd

Create `/etc/systemd/system/b-bot-advanced.service`:

```ini
[Unit]
Description=B-BOT Advanced
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=bbot
Group=bbot
WorkingDirectory=/opt/b-bot-advanced/B-BOT-Advanced/backend
EnvironmentFile=/etc/b-bot-advanced/b-bot.env
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/opt/b-bot-advanced/B-BOT-Advanced/backend/.venv/bin/uvicorn \
    app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5
UMask=0077

# Sandboxing: grant only the data directory read/write access.
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/b-bot-advanced/B-BOT-Advanced/backend/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
LockPersonality=true
MemoryDenyWriteExecute=true
SystemCallArchitectures=native
CapabilityBoundingSet=
AmbientCapabilities=
```

Voice/GPIO milestones need extra device access; add only the specific group or
device to `SupplementaryGroups`/`DeviceAllow` instead of dropping the sandbox.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now b-bot-advanced
sudo systemctl status b-bot-advanced
```

## Data permissions and retention

The service creates `data/`, the database, and WAL/SHM files with `0700`/`0600`
permissions. Keep the service user as the only owner. Do not copy plaintext
databases to shared storage.

Set `B_BOT_RETENTION_DAYS` to automatically delete conversations and audit rows
older than the window at startup (`0` keeps them forever). “Delete conversation”
remains available for immediate removal. Backups are not purged automatically;
expire them with the same policy.

## Backups

SQLite runs in WAL mode. Back up with the online backup API or by checkpointing
first:

```bash
sudo -u bbot install -d -m 700 data/backups
sudo -u bbot sqlite3 data/b-bot.db "PRAGMA wal_checkpoint(TRUNCATE);"
sudo -u bbot cp data/b-bot.db data/backups/b-bot-$(date +%F).db
sudo chmod 600 data/backups/b-bot-*.db
```

Encrypt backups before they leave the host and protect the key separately:

```bash
age -r <recipient> -o data/backups/b-bot-$(date +%F).db.age data/backups/b-bot-$(date +%F).db
rm data/backups/b-bot-$(date +%F).db
```

Keep only the desired retention window and store encrypted copies off the Pi.

## Reverse proxy and abuse limits

In-app limits cover per-IP requests, auth lockout, request-body size, streamed
reply size, and history size. Add edge limits as defense in depth:

- **Caddy:** `request_body { max_size 1MB }` and `rate_limit` plugin (or a
  global `@backend` matcher with `limit`).
- **nginx:** `client_max_body_size 1m;`, `limit_req_zone`/`limit_req`, and
  `proxy_read_timeout` sized to the inference timeout.
- Restrict `/api/*` to the household LAN/VPN and expose only the proxy.
- Keep auth failure logs and alert on repeated 401/429 responses.

## Optional exposure

- **Tailscale:** keep the service bound to `127.0.0.1` and use `tailscale serve`.
- **HTTPS:** terminate TLS at a reverse proxy (Caddy, nginx) and keep the bearer token.
- **Docker:** suitable for hosts without GPIO requirements; not the primary target.
- **Firewall:** allow only the proxy/VPN ports; block the backend port from the LAN.

## Portability notes

- Core code is pure Python; do not import Pi-only libraries outside adapters.
- `gpio` is enabled only when `libgpiod`/`gpiozero` is present.
- Home Assistant and MQTT adapters are optional and never MVP dependencies.
