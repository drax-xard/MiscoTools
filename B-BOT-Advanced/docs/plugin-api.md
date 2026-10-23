# Plugin API

Plugins extend B-BOT with tools, triggers, and notification channels. Each plugin is a
folder containing a manifest and a Python entry point.

> Status: first-party manifest loading, validation, enable/disable state,
> capability-scoped contexts, tool invocation, timeouts, and audit logging are
> implemented. Third-party plugin installation remains disabled until the
> subprocess isolation design in `docs/security-decisions.md` is built.

## Manifest

```yaml
id: reminders
name: Reminders
version: 0.1.0
description: One-off and recurring reminders.
permissions:
  - notify
  - storage
entrypoint: plugin.py

tools:
  - name: create_reminder
    description: Create a reminder at a specific time.
    parameters:
      type: object
      properties:
        text: { type: string }
        when: { type: string, description: ISO 8601 timestamp }
      required: [text, when]

triggers:
  - type: schedule
    cron: "* * * * *"

config:
  type: object
  properties:
    default_channel: { type: string, default: web }
  required: []

lifecycle:
  setup: setup
  teardown: teardown
```

### Fields

- **Identity:** `id`, `name`, `version`, `description`, `entrypoint`.
- **Permissions:** subset of `notify`, `storage`, `network`, `gpio`, `filesystem`, `home`.
- **Tools:** `name`, `description`, JSON-schema `parameters`.
- **Triggers:** `schedule`, sensor `event`, or `webhook`.
- **Config:** JSON schema plus defaults.
- **Lifecycle:** optional `setup` and `teardown` callables.

## Execution rules

- Manifests are validated at startup without importing entrypoint code.
- Plugins are disabled until explicitly enabled. Entrypoint code is imported only
  when a plugin is enabled, so disabled plugins do not execute top-level code.
- Every tool call is checked against the plugin's declared permissions and the
  tool's own permission subset.
- Tool argument objects are validated against the declared JSON schema. Unknown
  properties are rejected unless `additionalProperties: true` is set.
- Tool executions have a timeout and isolated error handling. A failing plugin does
  not stop the scheduler, other plugins, or the API.
- Confirmation-required tools are denied until the single-use confirmation protocol
  is implemented.
- Tool calls, argument digests, results, timeouts, and permission denials are written
  to `audit_log`. Raw arguments are not written to the audit log.
- Plugins use the standard library or declared optional dependencies; they cannot
  install packages automatically.
- The current loader is in-process and first-party only. It is not a sandbox.

## Entry point

```python
def setup(context):
    """Optional: called when the plugin is enabled."""


def teardown(context):
    """Optional: called when the plugin is disabled or the process stops."""


async def create_reminder(context, text, when):
    context.storage.set("last_reminder", {"text": text, "when": when})
    await context.notify.send(f"Reminder: {text}")
    return {"ok": True}
```

`context` exposes only the capabilities granted by the manifest permissions.

Implemented capabilities:

- `storage` — `context.storage.get/set/delete/all`, scoped to one plugin.
- `notify` — `await context.notify.send(message, target="household")`. Tools that
  use notifications must be async; synchronous tools run in a worker thread.

The `network`, `gpio`, `filesystem`, and `home` permissions can be declared, but no
in-process capability object is provided for them yet. Tools that require an
unimplemented capability are denied.

## HTTP API

- `GET /api/plugins` — loaded first-party manifests, tool names, enable state, and
  load errors.
- `PATCH /api/plugins/{id}` with `{"enabled": true|false}` — enable or disable a plugin.
  The state is persisted in SQLite and re-applied at startup.
- `POST /api/plugins/{id}/tools/{tool}` with `{"arguments": {...}}` — manual tool
  invocation for administration and testing. LLM tool calling is still deferred to
  Milestone 5.

All routes require the household bearer token.

## Triggers

Trigger declarations are validated and stored, but trigger execution is not enabled
yet. Schedule/event/webhook wiring will be added with the router and device milestones.

## Notification channel contract

A channel plugin declares delivery targets and configuration fields, then implements a
provider-neutral send call.

```python
class NotificationChannel:
    id: str
    targets: list[str]  # e.g. ["household", "member"]

    def send(self, message: str, target: str = "household") -> dict:
        ...
```

- Channels may implement retries and delivery status reporting.
- WhatsApp must use an official provider API with opt-in and template handling.
- Proactive messages must respect each provider's templates and opt-in rules.
- Failures in one channel must not block the others.

## Built-in plugins (planned)

`reminders`, `chores`, `members`, `notifications`, `notify_telegram`,
`notify_whatsapp`, `projects`, `documents`, `smart_leds`, `home_assistant`, `mqtt`,
`gpio`.

The registry is present, but `backend/plugins/` is intentionally empty in this
milestone. The first-party plugin implementations will be added as their features are
wired to tools.
