# B-BOT Advanced

Always-on, bilingual (English / Argentinian Spanish) household and work assistant.
Runs on a Raspberry Pi 5; uses a remote OpenAI-compatible LLM and Whisper endpoint,
with local voice, memory, plugins, and device access.

See [PLAN.md](PLAN.md) for the full development plan and milestones.

## Status

Milestones 2 (skeleton) and 3 (backend and chat MVP) are in progress. The backend
currently provides:

- FastAPI service with a public `/health` endpoint.
- Bearer-token authentication for every `/api` route.
- SQLite storage in WAL mode with FTS5 message/document indexes.
- Conversation list, create, rename, delete, and Markdown export.
- Streamed chat completions from any OpenAI-compatible endpoint via SSE.
- Read-only settings plus an editable system prompt.
- A dependency-free web chat client.

Voice, plugins, chores, notifications, and device adapters are scaffolded but not
implemented yet.

## Layout

```text
backend/
  app/
    main.py            FastAPI app factory and lifespan
    deps.py            auth and storage dependencies
    core/              config, database, LLM client
    api/               chat and settings routes
    notifications/     channel dispatcher (planned)
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
pip install -e ".[dev]"

cp .env.example .env          # set B_BOT_AUTH_TOKEN and LLM endpoint
cp config.yaml.example config.yaml   # optional; .env overrides it

uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for the API, or serve `frontend/` from any static
server pointed at the backend.

## Configuration

Configuration comes from `backend/config.yaml` and `backend/.env`; environment
variables win. See `config.yaml.example` for the full shape. The essential values
are the household bearer token and the LLM base URL/model.

## Security defaults

- LAN-only binding (`127.0.0.1` by default; set `host` explicitly to expose it).
- Single household bearer token; the server fails closed if no token is configured.
- API keys and the token are redacted in `/api/settings`.
- Audio recordings are expected to be discarded after transcription once voice lands.

## Tests

```bash
cd backend
pytest
```
