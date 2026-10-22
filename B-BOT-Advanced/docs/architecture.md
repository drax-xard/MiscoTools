# Architecture

B-BOT Advanced splits responsibilities between the always-on host (Raspberry Pi 5)
and an inference machine.

```text
USB mic / speaker ──> voice service ─┐
Web client ──────────────────────────┼──> FastAPI on the Pi ──> remote LLM + Whisper
Smart LEDs / GPIO / optional HA ─────┘             │
                                                   ├── SQLite (WAL + FTS5)
                                                   ├── scheduler
                                                   ├── event bus
                                                   ├── notification dispatcher
                                                   └── plugin registry
```

## Runtime components

| Component | Responsibility | Status |
| --- | --- | --- |
| API (`app/main.py`) | HTTP surface, lifespan wiring, health | Implemented |
| Config (`core/config.py`) | YAML + `.env` loading, path resolution | Implemented |
| Storage (`core/database.py`) | SQLite schema, WAL, FTS5, audit log | Implemented |
| LLM (`core/llm.py`) | OpenAI-compatible streaming client | Implemented |
| Chat API (`api/chat.py`) | Conversations, SSE streaming, export | Implemented |
| Settings API (`api/settings.py`) | Redacted config, system prompt | Implemented |
| Router (`core/router.py`) | Deterministic parsing + LLM tool calls | Planned |
| Scheduler (`core/scheduler.py`) | APScheduler reminders and chores | Planned |
| Event bus (`core/events.py`) | Sensor/device/voice events | Planned |
| Plugins (`plugins/`) | Manifest, permissions, tools, audit | Planned |
| Voice (`voice/`) | Wake word, VAD, STT, TTS, state machine | Planned |
| Devices (`devices/`) | LEDs, Home Assistant, MQTT, GPIO | Planned |
| Notifications (`notifications/`) | Channel registry and dispatch | Planned |

## Request flow (chat)

1. The client sends `POST /api/chat/conversations/{id}/messages` with a bearer token.
2. The user message is persisted and the conversation title is derived from the first message.
3. History plus the system prompt is sent to the configured `/chat/completions` endpoint.
4. The reply streams back as SSE `delta` events; the complete text is persisted and emitted
   as a `done` event.
5. Errors are emitted as an `error` event without terminating the server; partial replies are
   saved when possible.

## Portability rules

- Core modules are pure Python and do not import Pi-specific libraries.
- Optional capabilities (GPIO, Home Assistant, MQTT, local STT) are adapters selected by
  configuration and availability at startup.
- Hardware profiles only change feature flags, device paths, and resource limits.

## Data model

`conversations`, `messages`, `members`, `tasks`, `chores`, `chore_completions`,
`projects`, `documents`, `notification_channels`, `notification_log`, `plugins`,
`plugin_config`, `events`, `audit_log`, `settings`.

Defaults: single household, one shared token, Markdown project files, SQLite WAL,
daily backups, structured memory first (vector search later).

## Design decisions

- **Remote inference by default.** The Pi orchestrates; it does not host the LLM.
- **SSE over WebSockets for chat.** Simpler through reverse proxies and easy to reconnect.
- **Fail closed on auth.** No token means no authenticated route.
- **SQLite with FTS5 now, vectors later.** Keeps the first release small.
- **In-process plugins with permission checks.** Subprocess isolation can be added later.
