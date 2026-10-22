# Deployment

Target: Raspberry Pi 5 (8 GB), Raspberry Pi OS 64-bit, native Python virtual
environment and systemd. macOS launchd and Docker are later options.

## Install

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip git

git clone <repository> MiscoTools
cd MiscoTools/B-BOT-Advanced/backend

python3 -m venv .venv
. .venv/bin/activate
pip install -e .
```

## Configure

```bash
cp .env.example .env
cp config.yaml.example config.yaml
```

Set at minimum:

- `B_BOT_AUTH_TOKEN` — a long random household token.
- `B_BOT_LLM_BASE_URL` and `B_BOT_LLM_MODEL` — the inference machine.
- `B_BOT_HOST` — keep `127.0.0.1` unless a reverse proxy or Tailscale fronts the Pi.

Generate a token with:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Run manually

```bash
cd MiscoTools/B-BOT-Advanced/backend
. .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

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
User=pi
WorkingDirectory=/home/pi/MiscoTools/B-BOT-Advanced/backend
EnvironmentFile=/home/pi/MiscoTools/B-BOT-Advanced/backend/.env
ExecStart=/home/pi/MiscoTools/B-BOT-Advanced/backend/.venv/bin/uvicorn \
    app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now b-bot-advanced
sudo systemctl status b-bot-advanced
```

## Backups

SQLite runs in WAL mode. Back up with the online backup API or by checkpointing first:

```bash
sqlite3 data/b-bot.db "PRAGMA wal_checkpoint(TRUNCATE);"
cp data/b-bot.db data/backups/b-bot-$(date +%F).db
```

Keep daily backups and copy them off the Pi. `scripts/` will provide an automated
backup helper in a later milestone.

## Optional exposure

- **Tailscale:** keep the service bound to `127.0.0.1` and use `tailscale serve`.
- **HTTPS:** terminate TLS at a reverse proxy (Caddy, nginx) and keep the bearer token.
- **Docker:** suitable for hosts without GPIO requirements; not the primary target.

## Portability notes

- Core code is pure Python; do not import Pi-only libraries outside adapters.
- `gpio` is enabled only when `libgpiod`/`gpiozero` is present.
- Home Assistant and MQTT adapters are optional and never MVP dependencies.
