# Security Decisions — Milestone 4

**Date:** 2026-10-23
**Scope:** Decisions required before implementing plugins, chores, reminders, and
notifications. This document records the controls that Milestone 4 code must follow.

## SEC-20 — Plugin execution boundary

- Milestone 4 ships **first-party plugins only**. Arbitrary plugin installation stays
  disabled; the loader reads only the repository-managed `plugins/` directory and there
  is no upload/install API. Changing `plugins_path` is an admin-level configuration
  action and does not create a sandbox.
- Manifests are parsed without importing code. A plugin's entrypoint is imported only
  when the plugin is explicitly enabled, so disabled plugins do not execute top-level
  code at startup.
- Permission checks are enforced at the tool-call boundary through a capability-scoped
  `PluginContext`. A plugin receives only the storage, notification, or event helpers
  granted by its manifest.
- In-process permission checks are **not** a sandbox. Third-party plugins must not be
  accepted until a subprocess/container boundary with a dedicated OS user, restricted
  filesystem, network deny-by-default, and RPC-level permissions is implemented.
- Confirmation-required tools are denied until the single-use confirmation protocol
  exists; a boolean `confirmed` flag is not an acceptable approval mechanism.
- Tool calls, arguments digests, results, timeouts, and permission denials are written
  to `audit_log`.

### Deferred subprocess isolation design

Third-party plugin support will use an out-of-process runner:

- One runner process per plugin (or a small pooled worker) under a dedicated OS user
  with no shell and no home directory.
- The runner receives only the plugin directory (read-only) plus a dedicated storage
  directory. It cannot read the household database, `.env`, token, or inference keys.
- Network access is denied by default. A `network` permission would require an
  explicit proxy/allowlist; `filesystem`, `gpio`, and `home` capabilities are brokered
  by the core and never granted as raw host access.
- Core-to-runner RPC over a Unix socket/pipe uses JSON messages with plugin id, tool
  name, argument digest, request id, deadline, and a size-capped result. The runner
  cannot call tools or capabilities that the core did not grant for that request.
- The core enforces timeouts and kills/restarts the runner on deadline or crash.
  Lifecycle setup/teardown also runs through the runner.
- Notifications, events, and storage are proxied through the core broker; provider
  secrets never enter the runner.
- Manifests must be signed or checksum-pinned and manually reviewed. Plugin
  dependencies are pinned and audited like core dependencies.

Until this exists, the in-process loader remains first-party-only.

## SEC-21 — Tool calling and prompt injection

- Milestone 4 does not enable LLM tool calling. The plugin registry may expose tools, but
  the chat router will not call them until Milestone 5.
- Before tool calling lands: tools are default-deny per conversation, arguments are
  validated against strict JSON schemas with unknown fields rejected, and retrieved
  text is always treated as data, never as instructions.
- Model-generated shell commands or code are never executed.

## SEC-22 — Confirmation protocol

- Sensitive actions will use short-lived, single-use confirmation tokens bound to the
  action, arguments, requesting client, and timestamp.
- Voice confirmation is lower assurance than an explicit web confirmation. High-risk
  actions require the web path.
- Milestone 4 records the design only; no destructive device/tool actions ship yet.

## SEC-23 — Notification channels

- Built-in channels in this milestone are `web` and `voice`; neither accepts a
  user-supplied URL.
- External providers (Telegram, WhatsApp) remain deferred. When added, provider secrets
  must live in the OS keyring or systemd credentials, be redacted from logs, and be
  validated against an allowlist of provider hosts.
- Channel failures are isolated: one failing channel cannot block the others. Delivery
  attempts, retry counts, and errors are logged.
- Notification sends are rate-limited, retries are capped, and targets are validated
  against known household values.

## SEC-29 — Scheduler input validation

- Only strict cadence values are accepted: `daily`, `weekly`, `biweekly`, `monthly`,
  `every:N:days`, and `every:N:weeks`. Free-form cron is not accepted.
- Recurrences have a configurable minimum interval. The number of scheduled jobs is
  capped. Invalid values return `422`.
- Times are stored in UTC; recurrence calculations use the configured household
  timezone (`America/Argentina/Buenos_Aires` by default).
- A scheduler job is idempotent per occurrence. Overdue reminders within the grace
  window are delivered once; older ones are marked missed instead of causing a storm.

## SEC-26 — Dashboard rendering

- The dashboard renders all API, user, model, chore, reminder, and notification data
  through DOM text nodes (`textContent`, `Option`). It does not use `innerHTML`,
  `insertAdjacentHTML`, or `document.write`.
- Chat remains plain text: model output and user messages are never interpreted as
  HTML or Markdown.
- The existing CSP stays strict (`script-src 'self'`, `style-src 'self'`, no inline
  scripts or event handlers). The frontend does not require external assets.
- `backend/tests/test_frontend.py` guards these rendering rules. Project Markdown
  viewing/export remains deferred and must use a sanitizer or plain-text renderer.

## Voice channel semantics

The voice channel publishes a persisted `voice.notify` event and records the delivery as
`queued`. Audio/TTS is Milestone 5 work. This keeps the notification contract honest
without pretending audio was produced.
