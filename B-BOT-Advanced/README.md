# B-BOT Advanced

Always-on, bilingual (English / Argentinian Spanish) household and work assistant.
Runs on a Raspberry Pi 5; uses a remote OpenAI-compatible LLM and Whisper endpoint,
with local voice, memory, plugins, and device access.

See [PLAN.md](PLAN.md) for the full development plan and milestones.

## Status

Milestones 2 (skeleton) and 3 (backend and chat MVP) are complete. Milestone 4
(plugins, reminders, chores, notifications) has its security-first backend
foundation implemented:

- FastAPI service with a public `/health` endpoint.
- Bearer-token authentication for every `/api` route, with failure lockout and
  zero-downtime token rotation.
- SQLite storage in WAL mode with FTS5 message/document indexes and guarded
  schema migrations.
- Conversation list, create, rename, delete, and Markdown export.
- Streamed chat completions from any OpenAI-compatible endpoint via SSE, with
  request/response/history limits.
- Household members with point totals.
- Recurring chores with assignment, completion history, and scoring.
- One-off and recurring reminders persisted across restarts and rebuilt into
  APScheduler at startup.
- A notification dispatcher with isolated channels, retries, rate limiting,
  delivery logging, and built-in `web` and `voice` channels. The voice channel
  queues a `voice.notify` event for the Milestone 5 voice service.
- Read-only settings plus an editable system prompt.
- A dependency-free web chat client served by the backend with CSP and security
  headers.

The plugin loader and the Today/notification web UI are the next Milestone 4
tasks. Voice, GPIO, and external notification providers remain planned.

## Layout

```text
backend/
  app/
    main.py            FastAPI app factory and lifespan
    deps.py            auth and storage dependencies
    core/              config, database, LLM, events, scheduler, recurrence
    api/               chat, settings, members, chores, reminders, notifications
    notifications/     channel contract, dispatcher, web/voice channels
    plugins/           loader, registry, permissions (planned)
    voice/             wake word, VAD, STT, TTS (planned)
    devices/           LEDs, Home Assistant, MQTT, GPIO (planned)
  tests/               pytest suite
  config.yaml.example
  .env.example
frontend/              static chat client
docs/                  architecture, plugin API, voice, deployment, discovery
scripts/               install, systemd, backup (planned)
```

## Quick start

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.lock
pip install -e . --no-deps
pip install -e ".[dev]"   # development tools only

cp .env.example .env          # set B_BOT_AUTH_TOKEN and LLM endpoint
cp config.yaml.example config.yaml   # optional; .env overrides it

uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/` for the chat UI (the backend serves it with security
headers). API docs are disabled by default; set `B_BOT_DOCS_ENABLED=true` only on
loopback during development.

## Configuration

Configuration comes from `backend/config.yaml` and `backend/.env`; environment
variables win. See `config.yaml.example` for the full shape. The essential values
are the household bearer token and the LLM base URL/model.

## Security defaults

- LAN-only binding (`127.0.0.1` by default; set `host` explicitly to expose it).
- Single household bearer token; the server fails closed if no token is configured.
- In-app rate limits, auth lockout, request-body limits, and a cap on concurrent
  chat streams.
- API keys and the token are redacted in `/api/settings`; topology is never exposed.
- HTTPS is required for non-loopback inference endpoints unless explicitly overridden.
- Data directories/files are created with `0700`/`0600` permissions.
- Audio recordings are expected to be discarded after transcription once voice lands.

## Tests

```bash
cd backend
pytest
```
