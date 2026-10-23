# Current Session — B-BOT Advanced Milestone 4

**Started:** 2026-10-23
**Scope:** Security-first backend slice of Milestone 4 (plugins, reminders, chores, notifications).
**Status:** Phases 0–6 complete; verification/docs updated. Dashboard UI (7) is the next session.

## Confirmed decisions

- **Scheduler:** APScheduler with SQLite as the source of truth; jobs are rebuilt from
  the database at startup.
- **Plugin trust:** first-party/built-in only for now. Subprocess isolation is designed
  but deferred; third-party plugin installation stays disabled.
- **Voice channel:** queue a `voice.notify` event for Milestone 5; no audio this session.
- **Web notifications:** polling first; a generic SSE notification stream is deferred.
- **Household timezone:** `America/Argentina/Buenos_Aires` by default; UTC remains
  configurable and further timezone UX is deferred.

## Task tree

Legend: `[ ]` pending, `[~]` in progress, `[x]` done, `[!]` blocked.

### 0. Lock scope and security design
- [x] 0.1 Baseline: pytest (28 passed), ruff clean, dependency check
- [x] 0.2 Confirm scheduler model (APScheduler + SQLite source of truth)
- [x] 0.3 Confirm first-party-only plugin trust model
- [x] 0.4 Document SEC-20, SEC-21/22, SEC-23, SEC-29 decisions
- [x] 0.5 Define voice-channel semantics (queue event until Milestone 5)
- [x] 0.6 Add config: timezone, scheduler limits, notification limits

### 1. Storage and migrations
- [x] 1.1 Guarded SQLite migration helper (`PRAGMA user_version`)
- [x] 1.2 Extend tasks and notification_log schema; add indexes, notifications table
- [x] 1.3 Repository methods: members, tasks, chores, completions, channels, log, events
- [x] 1.4 Transaction helper for chore completion + points + history + audit
- [x] 1.5 Tests: migration, CRUD, transaction

### 2. Event bus and scheduler
- [x] 2.1 `core/events.py`: async pub/sub with persisted events
- [x] 2.2 `core/scheduler.py`: APScheduler wiring and startup rebuild
- [x] 2.3 `core/recurrence.py`: strict cadence parser and timezone handling
- [x] 2.4 SEC-29 controls: job caps, minimum intervals, invalid input rejection
- [x] 2.5 Idempotency and missed-run policy
- [x] 2.6 Tests: restart recovery, duplicate prevention, invalid cadence, caps

### 3. Members and chores
- [x] 3.1 Members service and API
- [x] 3.2 Chores service and API
- [x] 3.3 Chore completion transaction and points
- [x] 3.4 Completion history and due endpoints
- [x] 3.5 Tests: assignment, scoring, recurrence, history, auth, audit

### 4. Reminders
- [x] 4.1 Reminders service and API
- [x] 4.2 Scheduler integration
- [x] 4.3 Due delivery, idempotency, recurring next occurrence
- [x] 4.4 Restart recovery and overdue tests
- [x] 4.5 Deterministic natural-language parsing deferred to Milestone 5

### 5. Notification dispatcher
- [x] 5.1 Channel protocol and delivery result model
- [x] 5.2 Dispatcher: fan-out, isolation, retries, rate limits, log/audit
- [x] 5.3 Web channel: persistence, unread/list API, polling
- [x] 5.4 Voice channel: `voice.notify` event, queued status
- [x] 5.5 Notifications API: channels list/enable/test, log
- [x] 5.6 SEC-23 controls: target validation, retry caps, isolation, no user-supplied URLs
- [x] 5.7 Tests: fan-out, failure isolation, retries, web/voice delivery

### 6. Plugin foundation
- [x] 6.1 Manifest schema and validation
- [x] 6.2 Loader/registry, disabled by default, persisted enable state
- [x] 6.3 Capability-scoped context and permission checks
- [x] 6.4 Timeouts, isolated errors, tool-call/denial audit
- [x] 6.5 SEC-20 boundary: first-party only; subprocess isolation design
- [x] 6.6 Tests

### 7. Aggregation and UI (next session)
- [ ] 7.1 `/api/dashboard/today`
- [ ] 7.2 Today dashboard
- [ ] 7.3 Household/chore/reminder views
- [ ] 7.4 Notification configuration and test action
- [ ] 7.5 Safe rendering and minimal EN/ES copy

### 8. Verification and documentation
- [x] 8.1 Pytest (70 passed) and ruff clean; pip-audit reports advisories with no available fixed versions (see below)
- [x] 8.2 Acceptance covered by tests: assign/complete/score chore, reminder restart, web+voice dispatch, plugin enable/tool audit
- [x] 8.3 Update security-audit status for SEC-20/23/29
- [x] 8.4 Update architecture, plugin-api, README, PLAN, CHANGELOG
- [ ] 8.5 Commit only if explicitly requested

## Live log

- Baseline confirmed: 28 tests passed, ruff clean.
- Added APScheduler 3.11.0 and tzlocal 5.3.1; lockfile and pyproject updated.
- Added guarded migrations, notifications table, due indexes, and repositories.
- Added event bus, strict recurrence parser, scheduler rebuild, grace/missed handling.
- Added members, chores, reminders, and notifications APIs; wired into app lifespan.
- Added web/voice channels, dispatcher retry/isolation/rate limits, and notification inbox API.
- Added tests for recurrence, migrations, members/chores, reminders/scheduler, and notifications.
- Verification: 61 tests passed, ruff clean.
- `pip-audit -r requirements.lock` reports 8 advisories in anyio 4.12.1, starlette 0.49.3,
  and python-dotenv 1.2.1. The fixed versions it names are not available in the package
  index and FastAPI 0.128.8 does not support Starlette 1.x. CI now ignores those exact
  IDs with a dated rationale; remove the ignores when upstream constraints allow the
  fixed versions.
- Phase 6 added: manifest models and strict JSON-schema argument validation, plugin
  errors, capability-scoped context (storage/notify), lazy code loading, first-party
  registry, lifecycle hooks, tool timeouts, audit digests/denials, and plugin API.
- Phase 6 verification: 70 tests passed, ruff clean; lazy code loading is covered by a side-effect test.
- Security/decision docs updated with the subprocess isolation design; dashboard UI
  remains next session.

## Files added or changed

- `backend/app/plugins/errors.py`, `manifest.py`, `context.py`, `registry.py`
- `backend/app/api/plugins.py`
- `backend/tests/test_plugins.py`
- `backend/app/core/recurrence.py`, `events.py`, `scheduler.py`
- `backend/app/notifications/base.py`, `channels.py`, `dispatcher.py`
- `backend/app/api/members.py`, `chores.py`, `reminders.py`, `notifications.py`
- `backend/app/api/schemas.py`, `app/core/config.py`, `app/core/database.py`, `app/main.py`
- `backend/tests/test_recurrence.py`, `test_migrations.py`, `test_members_chores.py`,
  `test_reminders.py`, `test_notifications.py`
- `backend/pyproject.toml`, `backend/requirements.lock`, `backend/.env.example`,
  `backend/config.yaml.example`
- `docs/security-decisions.md`; updates to architecture, plugin-api, security-audit,
  README, PLAN, and CHANGELOG
