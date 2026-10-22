# Plugin API

Plugins extend B-BOT with tools, triggers, and notification channels. Each plugin is a
folder containing a manifest and a Python entry point.

> Status: the contract below is the target for milestone 4. The loader, permission
> checks, and audit entries are not implemented yet.

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

- Plugins are disabled until explicitly enabled.
- Every tool call is checked against declared permissions.
- Tool executions have a timeout and isolated error handling.
- Sensitive actions require user confirmation.
- Tool calls and permission denials are written to `audit_log`.
- Plugins use the standard library or declared optional dependencies; they cannot
  install packages automatically.
- Start in-process with permission checks; add subprocess isolation for risky plugins.

## Entry point

```python
def setup(context):
    """Optional: called when the plugin is enabled."""


def teardown(context):
    """Optional: called when the plugin is disabled or the process stops."""


def create_reminder(context, text, when):
    context.storage.create_task(text=text, due_at=when)
    context.notify.channel("web").send(f"Reminder: {text}")
    return {"ok": True}
```

`context` exposes only the capabilities granted by the manifest permissions.

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
