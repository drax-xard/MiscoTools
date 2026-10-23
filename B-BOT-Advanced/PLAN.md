# B-BOT Advanced — Development Plan

**Status:** In progress (Milestones 2–3 complete; Milestone 4 backend foundation complete)

**Primary target:** Raspberry Pi 5 (8 GB) running Raspberry Pi OS 64-bit natively.

**Portability goal:** Keep the core portable enough to run later on a Pi 4, mini PC, or Mac Mini, but do not optimize for those targets before the Pi 5 path works.

**Inference target:** A separate machine running an OpenAI-compatible LLM endpoint and Whisper speech-to-text. The Pi handles orchestration, voice, memory, plugins, and device access; it is not the primary inference host.

## Confirmed decisions

- USB microphone and USB speaker.
- English and Argentinian Spanish interaction.
- English wake word: **“B-BOT”**, pronounced like “bebop” with a final T.
- Spanish wake word: **“Bebote”**, pronounced “be'βote”.
- Speech-to-text: Whisper `base` in Spanish on the inference machine, with English support and an upgrade path to a larger model.
- Text-to-speech: local Piper initially, with English and Spanish voices.
- Notifications: plugin-based channels, including web, voice, Telegram, and WhatsApp.
- Chores: recurrence, member assignment, points, and completion history.
- Work documents: simple, concise Markdown templates.
- Authentication: one household-wide token.
- Current home setup: Google Assistant controlling two smart LED fixtures; no self-hosted Home Assistant and no MQTT broker.
- Home integration: the two smart LEDs plus local GPIO first. Home Assistant and MQTT remain optional adapters, not MVP requirements.

## Goals

- Provide a hands-free, bilingual, voice-activated assistant for routine home tasks and light work tasks.
- Keep the runtime lightweight and reliable on a Pi 5.
- Make capabilities modular through simple, permissioned plugin scripts.
- Keep LLM and Whisper inference remote by default.
- Preserve B-BOT Lite as the small, dependency-free browser client.
- Allow the notification system to grow without coupling the core to one messaging provider.

## Non-goals for the first release

- Training or fine-tuning language models.
- Running a large LLM on the Pi.
- Replacing Home Assistant with a general-purpose automation engine.
- Multi-user authentication or cloud synchronization.
- Mobile applications.
- Arbitrary untrusted plugin installation.
- Guaranteed local control of cloud-only smart devices.

## Primary use cases

### Home

- Create, list, postpone, and complete reminders.
- Manage recurring cleaning chores with assignments and points.
- See what is due and who it is assigned to.
- Control the two smart LED fixtures and local GPIO devices.
- React to sensor changes with notifications or actions.
- Deliver reminders through voice, the web UI, and configured notification channels.

### Work

- Brainstorm project ideas and capture decisions.
- Turn a spoken brief into a short development plan or design document.
- Keep project notes and retrieve them later.
- Export documents as Markdown.

## Architecture

```text
USB Mic / Speaker ──> Voice service ─┐
Web client ──────────────────────────┼──> FastAPI on the Pi ──> Remote LLM + Whisper
Smart LEDs / GPIO / optional HA ─────┘              │
                                                    ├── SQLite: chats, tasks, chores, projects
                                                    ├── Scheduler
                                                    ├── Event bus
                                                    ├── Notification dispatcher
                                                    └── Plugin registry (permissions + tools)
```

### Runtime responsibilities

- **B-BOT Advanced host:** API, orchestration, voice state machine, memory, scheduling, plugin execution, device adapters, notification dispatch, and web UI.
- **Inference machine:** chat completion model plus Whisper `base` for Spanish and English.
- **Clients:** web browser, USB microphone/speaker, smart LED integration, GPIO hardware, and notification channels.
- **Optional clients and adapters:** Home Assistant, MQTT, and additional messaging providers.

### Hardware portability

- Core modules must be pure Python and must not import Pi-specific libraries.
- Detect capabilities at startup: audio devices, GPIO, smart-home adapters, notification channels, and local STT.
- Optional adapters:
  - `gpio` plugin enabled only when `libgpiod` or `gpiozero` is available.
  - `home_assistant` and `mqtt` plugins independent of platform.
  - Voice service selects local or remote STT/TTS from configuration.
- Initial deployment:
  - Raspberry Pi OS 64-bit.
  - Native Python virtual environment.
  - systemd services.
- Later deployment options:
  - launchd on macOS.
  - Optional Docker for hosts without GPIO requirements.
- Configuration lives in `config.yaml` plus `.env`; hardware profiles only change feature flags, device paths, and resource limits.

## Components

### Backend

- FastAPI and Uvicorn.
- SQLite with WAL mode for structured state and full-text search.
- Server-sent events for streaming chat responses.
- Bearer-token authentication for LAN clients.
- LLM provider abstraction for any OpenAI-compatible `/chat/completions` endpoint.
- Whisper client for the inference machine.
- Router that combines deterministic command parsing with LLM tool calling.
- APScheduler with persisted jobs for reminders and recurring chores.
- Event bus for sensor changes, device state, voice state, and notifications.
- Notification dispatcher with channel plugins.
- Plugin registry with manifests, JSON-schema tools, permissions, and audit logging.

### Voice service

- USB audio input and output.
- Wake word detection, voice activity detection, speech-to-text, intent routing, and text-to-speech.
- Default pipeline:
  - Wake words: custom openWakeWord models for English “B-BOT” and Spanish “Bebote”.
  - VAD: Silero VAD or WebRTC VAD.
  - STT: remote Whisper `base` on the inference machine, with language selection from the wake word and auto-detection for mixed speech.
  - TTS: Piper locally with English and Spanish voices.
- Interaction languages: English and Argentinian Spanish.
- Push-to-talk in the web UI as a secondary input.
- States: idle, listening, thinking, speaking.
- Stop and barge-in support.
- Audio recordings are discarded after transcription by default; transcripts are retained.

### Web UI

- Bilingual chat with streamed replies.
- “Today” dashboard for reminders, chores, assignments, points, and device state.
- Household member profiles for chore assignment and score tracking.
- Project workspace with a Markdown editor and document viewer.
- Plugin manager with enable/disable and permission controls.
- Notification channel configuration and test action.
- Settings for LLM endpoint, Whisper endpoint, model, voice devices, smart LEDs, GPIO, optional Home Assistant/MQTT, and storage.
- Voice status and push-to-talk controls.

### Core plugins and adapters

- `reminders`: one-off and recurring reminders, natural-language creation, voice and web delivery.
- `chores`: recurring cleaning tasks, due dates, assignment, points, and completion history.
- `members`: household member profiles and point totals.
- `notifications`: channel registry and dispatch; built-in web and voice channels.
- `notify_telegram`: Telegram delivery adapter.
- `notify_whatsapp`: WhatsApp delivery adapter using an official provider API.
- `projects`: notes, brainstorm sessions, decision logs, and project context.
- `documents`: short development-plan and design-document templates with Markdown export.
- `smart_leds`: adapter for the two LED fixtures once the protocol is identified.
- `home_assistant`: optional REST actions and WebSocket state events.
- `mqtt`: optional publish/subscribe adapter.
- `gpio`: local sensors, relays, and status indicators.

## Plugin contract

Each plugin is a folder containing a manifest and a Python entry point.

### Manifest fields

- Identity: id, name, version, description.
- Permissions: `notify`, `storage`, `network`, `gpio`, `filesystem`, `home`.
- Tools: name, description, and JSON-schema parameters.
- Optional triggers: schedule, sensor event, or webhook.
- Configuration schema and defaults.
- Lifecycle hooks: setup and teardown.

### Execution rules

- Plugins are disabled until explicitly enabled.
- Every tool call is checked against declared permissions.
- Tool executions have timeouts and isolated error handling.
- Sensitive actions require confirmation.
- Tool calls and permission denials are written to the audit log.
- Plugins may use the standard library or declared optional dependencies; plugins cannot install packages automatically.
- Start with in-process execution plus permission checks. Add subprocess isolation for higher-risk plugins if needed.

### Notification channel contract

- A notification channel declares supported delivery targets and configuration fields.
- The core sends notifications through a provider-neutral interface.
- Channel plugins may implement retries and delivery status reporting.
- WhatsApp delivery must use an official provider API; unofficial automation that violates provider terms is out of scope.
- Proactive messages must respect each provider’s template and opt-in requirements.

## Data model

- `conversations`, `messages`
- `members`: name, active state, point total
- `tasks`: reminders, chores, and project tasks
- `chores`: cadence, last completed, next due, assigned member, point value
- `chore_completions`: chore, member, timestamp, points awarded
- `projects`, `documents`
- `notification_channels`, `notification_log`
- `plugins`, `plugin_config`
- `events`, `audit_log`
- `settings`

Defaults:

- Single household and single shared auth token.
- Member profiles are for assignment and scoring, not authentication.
- Plain Markdown project files.
- SQLite with WAL mode.
- Daily database backups.
- Structured memory first; vector search is a later addition.

## Voice and task flow

1. One of the two wake words is detected.
2. The wake word determines the initial language; mixed-language speech falls back to detection.
3. Audio is recorded until silence and transcribed by remote Whisper `base`.
4. The router selects a path:
   - Deterministic parser for reminders, timers, chores, and known device commands.
   - LLM tool calling for flexible requests.
   - Plain chat for brainstorming and document work.
5. Tools execute with permission and timeout checks.
6. Results are stored and returned through TTS and the web UI.
7. Reminders and event notifications are also sent through configured channels.
8. Destructive or ambiguous actions require confirmation.

## Repository layout

```text
B-BOT-Lite/                 # Current static app, renamed and rebound
B-BOT-Advanced/
  backend/
    app/
      main.py
      core/                 # llm, router, memory, scheduler, events, config
      api/                  # chat, tasks, chores, members, projects, plugins, devices
      notifications/        # dispatcher and channel interface
      plugins/              # loader, registry, permissions, base classes
      voice/                # wake, VAD, STT, TTS, audio state machine
      devices/              # smart LEDs, Home Assistant, MQTT, GPIO adapters
    plugins/                # Installed plugins
    data/                   # SQLite, Markdown projects, backups
    tests/
    pyproject.toml
    .env.example
  frontend/
  docs/                     # Architecture, plugin API, voice, deployment
  scripts/                  # Install, systemd, backup
  PLAN.md
```

`Shared/docs/` is reserved for material genuinely reused by more than one tool.

## Milestones

### 1. Discovery spike

- Verify the USB microphone and speaker on the Pi, including echo and audio quality.
- Identify the two smart LED fixtures, their protocol, and whether local control is available.
- Confirm the inference machine can host the LLM and Whisper `base` for Spanish and English.
- Evaluate wake-word training for “B-BOT” and “Bebote”, including cross-triggering and false positives.
- Measure wake-word, STT, LLM, and TTS latency.
- Choose the first external notification channel: Telegram or WhatsApp.
- Deliverable: `docs/discovery.md` with measured results and selected defaults.

### 2. Rename and skeleton

- Rename B-BOT to B-BOT Lite and update branding, links, descriptions, and changelog. **Completed.**
- Create the B-BOT Advanced backend and frontend structure, configuration, health endpoint, and documentation.
- Keep B-BOT Lite functional and dependency-free.
- Acceptance: B-BOT Lite runs from the new path; the Advanced service starts and reports health.

### 3. Backend and chat MVP **Completed.**

- Implement the SQLite schema, conversation persistence, LLM streaming, and settings.
- Build a web chat UI with streaming, stop, retry, and export.
- Add bearer-token authentication and LAN-only binding by default.
- Acceptance: a conversation streams from the remote model, survives a restart, and can be exported.

### 4. Plugins, reminders, chores, and notifications

> Backend foundation and first-party plugin registry completed (members, chores,
> reminders, scheduler, event bus, notification dispatcher, manifests, permissions,
> tool audit). The Today/notification UI remains.

- Implement the plugin loader, manifest validation, permissions, and audit log.
- Add household member profiles, reminders, recurring chores, assignments, points, and completion history.
- Implement the notification dispatcher with web and voice channels.
- Acceptance: create, assign, complete, and score chores; trigger reminders across restarts; deliver a notification to web and voice.

### 5. Bilingual voice MVP

- Implement wake word, VAD, STT, TTS, and voice state events.
- Train and validate English “B-BOT” and Spanish “Bebote” wake-word models.
- Connect remote Whisper `base` for Spanish and English.
- Add Piper English and Spanish voices.
- Start with deterministic commands, then add LLM tool calling.
- Acceptance: both wake words work; hands-free reminder creation and status queries work in both languages; stop/interrupt works.

### 6. Home integration

- Implement control of the two smart LED fixtures using the best available local or official API.
- Implement the GPIO plugin for local sensors, relays, and status indicators.
- Add optional Home Assistant and MQTT adapters without making them MVP dependencies.
- Add event-triggered notifications and actions.
- Acceptance: voice control works for both LED fixtures and a real GPIO sensor event triggers a configured response.

### 7. Work workspace

- Implement projects, brainstorm sessions, short document templates, and Markdown export.
- Add retrieval from project notes through SQLite FTS5.
- Include templates for a project brief, development plan, design document, and decision log.
- Acceptance: generate, save, and retrieve a concise design document from a spoken brief.

### 8. Notification expansion

- Add Telegram delivery.
- Add WhatsApp delivery through an official provider API, including opt-in and template handling.
- Add per-channel retry, delivery logging, and test actions in the web UI.
- Acceptance: a reminder can be delivered to at least one external channel and failures are logged without blocking other channels.

### 9. Hardening and release

- Add authentication tests, permission-denial tests, plugin failure isolation, and backup/restore.
- Provide systemd units and Raspberry Pi OS 64-bit deployment documentation.
- Run end-to-end tests and update the changelog and version.
- Acceptance: clean install on the target Pi, documented recovery, and no unhandled failures under normal use.

## Risks and mitigations

- **Smart LED cloud dependency:** the fixtures may expose only a vendor cloud or Google Assistant integration. Identify the protocol early; prefer Matter, a local vendor API, or a local Home Assistant bridge.
- **Bilingual wake words:** custom models may cross-trigger. Test both languages together and tune thresholds; use push-to-talk as a fallback.
- **Argentinian Spanish TTS:** Piper may lack a distinct Argentinian voice. Compare available Spanish voices and allow a remote TTS adapter if needed.
- **Whisper `base` accuracy:** accents and mixed-language speech may suffer. Measure early and keep a configuration path to a larger Whisper model.
- **WhatsApp integration:** official APIs require a provider, templates, and opt-in. Keep WhatsApp behind the notification plugin interface so Telegram or another channel can ship first.
- **Audio quality, echo, and false wake words:** test real hardware early; support push-to-talk and a configurable wake threshold.
- **Remote latency:** measure first-token and STT latency; keep voice responses short and stream aggressively.
- **Small-model tool calling:** use strict JSON schemas, deterministic fallbacks, and confirmation for critical actions.
- **Plugin security:** explicit permissions, no default shell access, audit logging, and optional subprocess isolation.
- **Accidental complexity:** keep the core plugin set small and defer general automation rules to Home Assistant if it is introduced.

## Defaults

- Audio: USB microphone and USB speaker.
- Wake words: English “B-BOT” and Spanish “Bebote”, both active.
- Languages: English and Argentinian Spanish.
- STT: remote Whisper `base`, Spanish and English, with an upgrade path.
- TTS: local Piper English and Spanish voices.
- Notifications: web and voice first; Telegram next; WhatsApp through an official provider.
- Chores: recurrence, assignments, points, and completion history.
- Work documents: simple Markdown templates, stored under `data/projects/`.
- Authentication: single household token, LAN-only by default, optional Tailscale or HTTPS.
- Local LLM on the Pi: disabled by default.
- Home integration: the two smart LEDs and GPIO first; Home Assistant and MQTT optional.
- Deployment: Raspberry Pi OS 64-bit native with systemd.

## Open discovery questions

- What are the exact make and model of the two smart LED fixtures, and which app or protocol controls them?
- Is Google Assistant the only current control path, or do the fixtures also support Matter, a local API, or a vendor API?
- Which external notification channel should be implemented first: Telegram or WhatsApp?
- If WhatsApp is required, which official provider or Business Cloud API setup will be used?
- What are the household member names for chore assignment and scoring?
- Should points have a reward or redemption system, or only a running scoreboard?
- Is a distinct Argentinian Spanish TTS voice required, or is a neutral Spanish voice acceptable?
- Which fields should the project brief, development plan, design document, and decision log templates contain?
- Should B-BOT Lite keep its existing browser storage keys to preserve existing conversations?
