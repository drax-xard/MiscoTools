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
| Settings API (`api/settings.py`) | User-facing settings, system prompt | Implemented |
| Router (`core/router.py`) | Deterministic parsing + LLM tool calls | Planned (Milestone 5) |
| Scheduler (`core/scheduler.py`) | APScheduler reminders and chores, rebuilt from SQLite | Implemented |
| Event bus (`core/events.py`) | Persisted async events, including `voice.notify` | Implemented |
| Recurrence (`core/recurrence.py`) | Strict cadences and household-timezone math | Implemented |
| Members API (`api/members.py`) | Household profiles and point totals | Implemented |
| Chores API (`api/chores.py`) | Recurrence, assignment, completion, scoring | Implemented |
| Reminders API (`api/reminders.py`) | One-off and recurring reminders | Implemented |
| Dashboard API (`api/dashboard.py`) | Household-timezone Today aggregation and daily stats | Implemented |
| Web UI (`frontend/`) | Today, household, chores, reminders, notifications, chat | Implemented |
| Plugins (`plugins/`) | First-party manifest loader, capabilities, tools, audit | Implemented |
| Voice (`voice/`) | Wake word, VAD, STT, TTS, state machine | Planned (Milestone 5) |
| Devices (`devices/`) | LEDs, Home Assistant, MQTT, GPIO | Planned (Milestone 6) |
| Notifications (`notifications/`) | Channel registry, dispatcher, web/voice channels | Implemented |

## Request flow (chat)

1. The client sends `POST /api/chat/conversations/{id}/messages` with a bearer token.
2. The user message is persisted and the conversation title is derived from the first message.
3. History plus the system prompt is sent to the configured `/chat/completions` endpoint;
   older turns are trimmed to the configured message/character budget.
4. The reply streams back as SSE `delta` events; the complete text is persisted and emitted
   as a `done` event. Streamed bytes and concurrent streams are capped.
5. Errors are emitted as a generic `error` event with a server-side correlation ID; partial
   replies are saved when possible.

## Reminder, chore, and notification flow

1. A reminder or chore is stored in SQLite with a UTC due timestamp and, for
   recurring items, a strict cadence label.
2. The scheduler service holds only in-memory APScheduler date triggers. At
   startup it rebuilds them from pending database rows.
3. When a trigger fires, the service checks the occurrence idempotency marker,
   applies the grace/missed policy, and calls the notification dispatcher.
4. The dispatcher creates one notification record and fans out to enabled
   channels. Each channel attempt is isolated, retried within a cap, and logged
   in `notification_log`.
5. The `web` channel is read by the browser inbox API. The `voice` channel
   publishes a persisted `voice.notify` event and is marked `queued`; audio is
   produced by the Milestone 5 voice service.

## Dashboard flow

1. `GET /api/dashboard/today` computes the local day boundary from the configured
   household timezone and classifies active chores and open reminders as overdue,
   due today, or upcoming.
2. The response also includes active members, unread notifications, the daily
   completion count, and points awarded today.
3. The static web client renders every value with `textContent`/`Option` nodes; it
   never assigns `innerHTML` or renders model/user text as HTML. The existing CSP
   continues to allow only same-origin scripts and styles.
4. The dashboard is polled on view changes and after mutations. A dedicated SSE
   notification stream remains deferred.

## Plugin flow

1. The registry scans the repository-managed `plugins/` directory and validates each
   YAML manifest with Pydantic. Entrypoint code is not imported during the scan.
2. Manifests are synchronised to the `plugins` table; new plugins start disabled.
3. Enabling a plugin imports its entrypoint, resolves the declared tools and optional
   lifecycle hooks, and builds a capability-scoped `PluginContext`.
4. Tool calls validate arguments against the tool schema, check the manifest/tool
   permissions, enforce a timeout, and audit the call, result, timeout, or denial.
   Raw arguments are represented only by a SHA-256 digest in the audit log.
5. `storage` and `notify` are the only implemented capabilities. Confirmation-required
   tools stay denied until the single-use confirmation protocol lands.
6. The loader is first-party only. Subprocess isolation is required before third-party
   plugins can be accepted.

## Portability rules

- Core modules are pure Python and do not import Pi-specific libraries.
- Optional capabilities (GPIO, Home Assistant, MQTT, local STT) are adapters selected by
  configuration and availability at startup.
- Hardware profiles only change feature flags, device paths, and resource limits.

## Data model

`conversations`, `messages`, `members`, `tasks`, `chores`, `chore_completions`,
`projects`, `documents`, `notification_channels`, `notifications`, `notification_log`, `plugins`,
`plugin_config`, `events`, `audit_log`, `settings`.

Defaults: single household, one shared token, Markdown project files, SQLite WAL,
daily backups, structured memory first (vector search later).

## Design decisions

- **Remote inference by default.** The Pi orchestrates; it does not host the LLM.
- **SSE over WebSockets for chat.** Simpler through reverse proxies and easy to reconnect.
- **Fail closed on auth.** No token means no authenticated route.
- **SQLite with FTS5 now, vectors later.** Keeps the first release small.
- **SQLite is the scheduler source of truth.** APScheduler jobs are rebuilt at
  startup, so a restart cannot lose reminders or chores.
- **First-party plugins only for now.** In-process permission checks are not a
  security boundary; subprocess isolation is designed but deferred. See
  `docs/security-decisions.md`.
- **Web notifications are polled first.** The dashboard and inbox poll the API; a
  dedicated SSE notification stream remains deferred.
- **Plain-text dashboard rendering.** User, model, chore, reminder, and notification
  content is inserted with DOM text nodes, not HTML. Markdown project views, when
  added, require a sanitizer or a plain-text renderer (SEC-26).
