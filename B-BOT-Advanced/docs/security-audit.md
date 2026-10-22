# Security Audit — B-BOT Advanced

**Date:** 2026-10-22
**Revision audited:** `7f92a99` (backend chat MVP), project version 0.1.0
**Scope:** `B-BOT-Advanced/PLAN.md`, `docs/architecture.md`, `docs/plugin-api.md`,
`docs/voice.md`, `docs/deployment.md`, and all current backend/frontend code.
**Method:** Manual design review, source review, dependency review, and targeted runtime
probes (unauthenticated access, CORS startup, malformed headers, public API schema).

## Executive summary

The current implementation is a small, LAN-oriented MVP and already applies several good
baseline controls: authentication fails closed, bearer tokens are compared in constant time,
SQL is parameterized, YAML uses `safe_load`, secrets are redacted in the settings API, and
the web client renders model output with `textContent` rather than HTML.

The main risks are **not** classic injection flaws in the current code; they are:

1. A **known default token** in `.env.example` that a deployment can accidentally keep.
2. Security-critical capabilities planned for later milestones (plugins, LLM tool calling,
   notifications, devices, voice) having **insufficient isolation and abuse controls** in the
   design.
3. Missing **abuse resistance** (rate limits, body/connection limits, history caps) on an
   always-on service that spends remote inference capacity.
4. Transport and secret-handling assumptions that are safe only while the service stays on
   loopback, but the plan targets LAN clients.

**Overall current risk: Medium.** No critical or high-severity exploitable defect was found
in the shipped MVP; one high-severity deployment foot-gun and several medium design gaps
should be fixed before exposing the service beyond `127.0.0.1` or adding plugins.

## Severity definitions

| Rating | Meaning |
| --- | --- |
| Critical | Remote compromise with minimal preconditions; fix immediately. |
| High | Practical compromise/escalation or a likely deployment mistake with major impact. |
| Medium | Meaningful risk under realistic conditions, or a missing defense-in-depth control. |
| Low | Limited impact, hardening, or information disclosure. |
| Info | Observation, accepted risk, or recommendation. |

## Findings summary

### Current code

| ID | Severity | Finding |
| --- | --- | --- |
| SEC-01 | High | `.env.example` ships a valid-looking default household token |
| SEC-02 | Medium | No rate limiting or connection limits; token brute force and inference-cost abuse |
| SEC-03 | Medium | Enabling CORS crashes startup; intended policy is also wildcard |
| SEC-04 | Medium | Full conversation history resent on every turn with no cap |
| SEC-05 | Medium | No global request-body or SSE response limits |
| SEC-06 | Medium | Bearer token persisted in `localStorage`; no CSP/security headers |
| SEC-07 | Medium | Public interactive docs and OpenAPI schema |
| SEC-08 | Medium | Dependencies use open-ended ranges; no lockfile or vulnerability audit |
| SEC-09 | Medium | SQLite data and backups have no explicit confidentiality/retention controls |
| SEC-10 | Low | Upstream LLM error bodies are relayed to clients |
| SEC-11 | Low | Health endpoint discloses filesystem path and feature state |
| SEC-12 | Low | Non-ASCII authorization header causes an unhandled 500 |
| SEC-13 | Low | FTS `MATCH` accepts raw text without escaping |
| SEC-14 | Low | Security-relevant actions are not written to `audit_log` |
| SEC-15 | Low | Single token provides no client identity, rotation, or revocation |
| SEC-16 | Low | Settings endpoint discloses internal endpoints and filesystem layout |
| SEC-17 | Info | No CSRF exposure today because the token is a header, not a cookie |
| SEC-18 | Info | SQL injection not observed; all current queries are parameterized |

### Plan and future milestones

| ID | Severity | Finding |
| --- | --- | --- |
| SEC-20 | High | In-process plugins cannot be constrained by declared permissions |
| SEC-21 | High | LLM tool calling plus indirect prompt injection from notes/documents |
| SEC-22 | Medium | “Sensitive action confirmation” is under-specified and replayable |
| SEC-23 | Medium | Notification adapters: secret handling, SSRF, templates, recipient abuse |
| SEC-24 | Medium | Device adapters (MQTT/HA/GPIO) lack secure-default requirements |
| SEC-25 | Medium | Voice: always-on capture, spoofing, plaintext audio, model integrity |
| SEC-26 | Medium | Projects/documents: Markdown XSS, unsafe filenames, export handling |
| SEC-27 | Medium | Deployment guidance uses a broad user and no service sandboxing |
| SEC-28 | Medium | Remote inference over plaintext HTTP by default |
| SEC-29 | Low | Scheduler abuse and invalid recurrence input |
| SEC-30 | Low | No data-retention or deletion policy for transcripts and audit data |

---

## Detailed findings — current code

### SEC-01 — Default token in `.env.example` is accepted (High)

**Evidence:** `backend/.env.example:5` sets
`B_BOT_AUTH_TOKEN=change-this-to-a-secret-token`.

The application only rejects an **empty** token (`app/deps.py:32-36`). Copying the example
file without editing it produces a running service protected by a publicly known token.
Because the plan explicitly uses a single household-wide token, this is the only access
control in front of chat history, settings, and (later) chores, documents, and devices.

**Impact:** Complete unauthorized access to the API for anyone who can reach the port.

**Recommendation:**
- Leave the example value empty and add a comment telling users to generate one.
- Reject known placeholder values and require a minimum length/entropy at startup.
- Add an install script or `python -m app.tools.gen_token` helper.
- Fail closed (already done) is not enough when a placeholder counts as configured.

### SEC-02 — No rate limiting, connection limits, or lockout (Medium)

**Evidence:** All routes in `app/api/chat.py` and `app/api/settings.py` accept unlimited
requests. There is no middleware or proxy guidance for throttling.

**Impact:**
- Online brute force of the household token (no lockout or backoff).
- Resource exhaustion (each request opens SQLite connections and an outbound HTTP stream).
- Inference-cost abuse: any authenticated client can trigger unlimited remote model calls.
- Slowloris-style connection exhaustion if exposed beyond loopback.

**Recommendation:**
- Add per-IP and global rate limits at the reverse proxy (Caddy/nginx) and optionally in-app.
- Add a small exponential backoff or temporary ban after repeated 401s.
- Cap concurrent streams per client and globally.
- Log throttling events.

### SEC-03 — CORS startup failure and wildcard policy (Medium)

**Evidence:** `app/main.py:34-41` calls `app.add_middleware()` inside the lifespan. This
raises `RuntimeError: Cannot add middleware after an application has started` when
`allow_cors: true`; reproduced with `TestClient`. When it does work in a future refactor, the
policy is `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`.

**Impact:** A configuration change intended to enable browser access instead makes the
service fail to start (availability). A wildcard policy paired with a token in
`localStorage` broadens the impact of any XSS or token leak.

**Recommendation:**
- Add the middleware during app construction, before startup, based on the loaded config.
- Replace `*` with an explicit origin allowlist from configuration.
- Keep `allow_credentials=False` (already correct for bearer tokens).
- Add a startup test for every supported CORS mode.

### SEC-04 — Unbounded conversation history resent each turn (Medium)

**Evidence:** `app/api/chat.py:117-124` loads every message and sends the full history plus
the system prompt to the model on each request. There is no token/character/message cap and
no truncation or summarization.

**Impact:** Cost and latency grow without bound; a long conversation can exceed model
context, fail, and still consume remote capacity. This becomes a cheap denial-of-service
vector for any authenticated client.

**Recommendation:**
- Add a configurable history budget (messages and characters).
- Trim oldest turns or summarize beyond the budget.
- Reject or warn when a single conversation exceeds a hard cap.
- Expose usage metrics for auditing.

### SEC-05 — No body or response size limits (Medium)

**Evidence:** `ChatRequest.content` is capped at 32,000 characters
(`app/api/schemas.py`), but there is no global request-body limit, no limit on number of
conversations/messages, and no cap on total streamed response size beyond `max_tokens`.

**Impact:** Large JSON bodies, many conversations, or oversized model output can exhaust
memory/disk. FastAPI/uvicorn do not impose a body limit by default.

**Recommendation:**
- Enforce `client_max_body_size` at the reverse proxy and a request-size middleware in-app.
- Cap stored message size and total database growth; add a retention/cleanup job.
- Bound the total bytes accumulated in `event_stream` (`app/api/chat.py:128-148`).

### SEC-06 — Token in `localStorage`; no CSP or security headers (Medium)

**Evidence:** `frontend/app.js:2` and `:255` read/write the bearer token in `localStorage`.
Output is rendered with `textContent` (`frontend/app.js:84`, `:172`), which is good, but the
app ships no Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy`, or
frame-ancestors control.

**Impact:** Any future XSS (for example when Markdown rendering, plugin UI, or third-party
scripts are added) can exfiltrate a persistent household token. The token also survives
browser restarts and is readable by any script on the same origin.

**Recommendation:**
- Serve the frontend from the backend with strict CSP (`default-src 'self'`,
  `script-src 'self'`, `connect-src 'self'`), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, and `frame-ancestors 'none'`.
- Consider `sessionStorage` or in-memory storage, with an explicit “remember” option.
- If Markdown is rendered later, sanitize it (the Lite client already had safe rendering;
  reuse that approach) and never allow raw HTML.
- Rotate the token if XSS is suspected.

### SEC-07 — Public API docs and OpenAPI schema (Medium)

**Evidence:** `GET /docs` and `GET /openapi.json` return 200 without authentication
(confirmed at runtime). Only `/api/*` routers carry `Depends(require_auth)`.

**Impact:** Unauthenticated users learn the full API surface, schemas, and version. It also
provides an interactive console for anyone who obtains a token.

**Recommendation:**
- Disable `docs_url`, `redoc_url`, and `openapi_url` in production, or protect them with the
  same auth dependency.
- Keep them enabled only on loopback during development.

### SEC-08 — Unpinned dependencies, no lockfile or audit (Medium)

**Evidence:** `backend/pyproject.toml` uses lower bounds (`fastapi>=0.110`,
`uvicorn[standard]>=0.29`, `httpx>=0.27`, …). There is no lockfile and no `pip-audit`/CI
vulnerability check.

**Impact:** A compromised or broken upstream release is pulled on install. Reproducibility
is poor on the Pi. Future plugin dependencies compound this.

**Recommendation:**
- Generate and commit a lockfile (`uv lock`, `pip-compile`, or `poetry lock`).
- Pin versions and, where practical, hashes for deployment.
- Run `pip-audit` in CI and before releases.
- Apply the same policy to wake-word models, Piper voices, and any downloaded models
  (checksums/signatures).

### SEC-09 — SQLite and backup confidentiality/retention (Medium)

**Evidence:** `app/core/database.py` creates the database and WAL files with default process
permissions. `docs/deployment.md` copies plain `.db` files to `data/backups/` with `cp` and
suggests copying them off the Pi. No retention policy is defined.

**Impact:** Conversation transcripts, and later chores/members/audit data, may be readable
by other local users or exposed through copied backups. Data accumulates indefinitely.

**Recommendation:**
- Create `data/` with `0700` and database/WAL/SHM files with `0600`, or run with `umask 077`.
- Encrypt backups and protect them with a separate key; avoid syncing them to shared storage.
- Define retention and deletion for conversations, messages, and audit logs.
- Consider full-disk encryption on the Pi.
- Keep `.env`, `config.yaml`, and database files out of git (already done).

### SEC-10 — Upstream error details relayed to clients (Low)

**Evidence:** `app/core/llm.py:63-68` and `:107-111` embed up to 500 bytes of the upstream
response in `LLMError`, and `app/api/chat.py:141-144` sends `str(exc)` to the browser.

**Impact:** Internal URLs, proxy diagnostics, or provider error payloads can be disclosed.
It can also confuse clients with misleading upstream messages.

**Recommendation:** Log detailed errors server-side with a correlation ID; return a generic
message plus that ID to the client.

### SEC-11 — Health endpoint information disclosure (Low)

**Evidence:** `app/main.py:49-60` returns the database path, version, model-configured flag,
and FTS state without authentication.

**Impact:** Reveals installation paths and feature state. Useful for reconnaissance.

**Recommendation:** Return only `{"status": "ok"}` publicly; expose detailed health on a
separate authenticated or loopback-only endpoint.

### SEC-12 — Non-ASCII authorization header causes 500 (Low)

**Evidence:** `app/deps.py:45` calls `hmac.compare_digest(token, config.auth_token)`.
Starlette decodes raw header bytes as Latin-1; `compare_digest` rejects non-ASCII `str` with
`TypeError`. Confirmed: a raw `Authorization: Bearer t\xf6k` request returns 500.

**Impact:** No authentication bypass, but crafted requests generate unhandled errors and log
noise; a monitoring system could interpret them as server faults.

**Recommendation:** Encode both values to bytes with a fixed encoding before comparison
(`hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8"))`), or explicitly
reject non-ASCII headers with 401.

### SEC-13 — FTS `MATCH` input not escaped (Low)

**Evidence:** `app/core/database.py:276-291` passes `query` directly to
`messages_fts MATCH ?`. The method is not currently exposed by an API route.

**Impact:** When search is exposed, FTS5 operators in user input can cause parse errors,
unexpected results, or expensive queries.

**Recommendation:** Escape/quote user terms and validate length before `MATCH`; return a
controlled 400 on FTS syntax errors; consider a dedicated search endpoint with limits.

### SEC-14 — Audit log does not cover security events (Low)

**Evidence:** `Database.audit()` exists, but `require_auth`, settings updates, and
conversation deletion do not call it.

**Impact:** No accountability for failed logins, configuration changes, or destructive
actions. This weakens incident response, especially with a shared token (`request.state.actor`
is always `"household"`).

**Recommendation:** Log authentication failures (without the token), settings changes,
conversation deletions, and later tool calls/permission denials. Add retention and integrity
protection for the audit log.

### SEC-15 — Single shared token, no identity or lifecycle (Low, accepted risk)

**Evidence:** `AppConfig.auth_token` (`app/core/config.py:59`) is one static secret; there is
no expiry, rotation endpoint, revocation list, or per-client label.

**Impact:** A leaked token grants full household access until manually changed; logs cannot
attribute actions. This is an explicit plan decision, so it is accepted for the MVP, but it
amplifies every other token-leak finding.

**Recommendation:** Document rotation steps. Later, add per-client tokens/labels and
revocation while keeping a simple household UX. At minimum, support token rotation without
downtime (two valid tokens during a change window).

### SEC-16 — Settings disclose internal topology (Low)

**Evidence:** `AppConfig.redacted()` (`app/core/config.py:68-77`) hides keys but returns
host/port, LLM/STT base URLs, filesystem paths, voice settings, and CORS state to any
authenticated client.

**Impact:** Leaks internal network names and layout to a compromised client.

**Recommendation:** Return only user-relevant settings; keep topology on a separate
admin-only surface.

### SEC-17 — CSRF (Info)

Bearer tokens in an `Authorization` header are not attached automatically by browsers, so
classic CSRF does not apply. If authentication moves to cookies, add CSRF tokens and
`SameSite` cookies.

### SEC-18 — SQL injection (Info)

All current SQL uses placeholders (`app/core/database.py`). No injection was observed.
Maintain this pattern and review future dynamic sorting/filtering carefully.

---

## Detailed findings — plan and future milestones

### SEC-20 — In-process plugins cannot enforce manifest permissions (High)

**Evidence:** `PLAN.md` (“Plugin contract”) and `docs/plugin-api.md` plan in-process execution
with declared permissions, and only optional subprocess isolation “for higher-risk plugins”.

In-process Python code can import any installed module, open any file the process can read,
reach the network, and spawn subprocesses regardless of what the manifest declares. A
permission check before calling a tool does not sandbox the code inside that tool.

**Impact:** A malicious or compromised plugin gains full access to the household token,
`.env` secrets, SQLite data, inference credentials, devices, and the host account.

**Recommendation:**
- Treat third-party plugins as untrusted code: run them in a separate process/container with
  a dedicated OS user, a restricted filesystem view, no network by default, and explicit
  capability brokering.
- Enforce permissions at the RPC boundary, not only inside the plugin.
- Require signed/allowlisted manifests and manual review; never auto-install packages.
- Pin and audit plugin dependencies.
- Keep the built-in plugin set small and first-party.
- Log every tool call, argument digest, result status, and permission denial.

### SEC-21 — Prompt injection and tool calling (High)

**Evidence:** `PLAN.md` combines deterministic parsing, LLM tool calling, project notes,
documents, web/notification content, and “flexible requests”. The current chat path already
sends all user content to the model (`app/api/chat.py:117-124`).

**Impact:** Once tools exist, untrusted text (project notes imported from elsewhere, web
content, notification bodies, model output) can instruct the model to call tools. With small
models this is easier to trigger. Consequences range from data exfiltration to destructive
device actions depending on tool permissions.

**Recommendation:**
- Treat all retrieved/user-supplied text as data, never as instructions; separate system,
  developer, and content channels explicitly.
- Default-deny tools; require per-tool allowlists and least-privilege permissions.
- Require out-of-band confirmation for destructive or externally visible actions.
- Validate tool arguments against strict JSON schemas and reject unknown fields.
- Constrain tool outputs and never execute model-generated code/shell.
- Add an injection-focused test suite with adversarial fixtures.

### SEC-22 — Confirmation mechanism is unspecified and replayable (Medium)

**Evidence:** `PLAN.md` says “Sensitive actions require confirmation” and “Destructive or
ambiguous actions require confirmation”, but there is no binding, expiry, single-use rule, or
distinction between web and voice confirmation.

**Impact:** A spoken “yes” from anyone in earshot can approve an action, and a captured
confirmation could be replayed. Ambiguous natural-language approval is hard to attribute.

**Recommendation:**
- Use short-lived, single-use confirmation tokens bound to the exact action, arguments,
  requesting client, and timestamp.
- Prefer explicit web/UI confirmation for high-risk actions; treat voice confirmation as
  lower assurance.
- Re-authenticate or require a second factor for device/security changes if added.
- Audit both the request and the approval.

### SEC-23 — Notification adapters (Medium)

**Evidence:** `PLAN.md` and `docs/plugin-api.md` plan Telegram, WhatsApp (official provider),
web, and voice channels, plus retries and delivery logging.

**Risks:**
- Provider tokens stored in config/database or logged in clear text.
- Webhook/callback URLs enable SSRF if user-configurable.
- Template/opt-in mistakes send household data to the wrong recipient.
- Retry storms and message flooding.
- WhatsApp unofficial automation is correctly out of scope; keep it that way.

**Recommendation:**
- Store provider secrets in the OS keyring or systemd credentials, not in plugin config.
- Redact secrets from logs and error reports.
- Allowlist provider hostnames; block private/link-local addresses for user-supplied URLs.
- Validate recipients against configured household members; require opt-in.
- Rate-limit and deduplicate notifications; isolate channel failures.
- Support immediate token revocation and delivery audit.

### SEC-24 — Device adapters (Medium)

**Evidence:** `PLAN.md` plans smart LEDs, GPIO, optional Home Assistant and MQTT.

**Risks:** MQTT without TLS/auth, overly broad Home Assistant tokens, GPIO access requiring
elevated privileges, command injection through device identifiers, and physical tampering.

**Recommendation:**
- Default MQTT to TLS with per-device credentials and ACLs; refuse anonymous/default configs.
- Use least-privilege Home Assistant tokens and allowlist entities/services.
- Run GPIO access under a dedicated user/group; never as root.
- Validate device/entity IDs against an allowlist and reject free-form shell/command strings.
- Put IoT devices on a separate VLAN where practical.
- Fail safe (e.g. do not unlock/open on ambiguous input).

### SEC-25 — Voice pipeline (Medium)

**Evidence:** `PLAN.md` and `docs/voice.md` describe always-on wake word, remote Whisper,
local Piper, and discard-after-transcription.

**Risks:** Continuous microphone capture in private spaces; false wakes and audio injection;
plaintext audio to the inference machine; temporary recordings surviving crashes or backups;
wake-word model tampering; transcripts retained indefinitely.

**Recommendation:**
- Provide a physical/software mute and a visible recording state.
- Discard audio in memory or securely delete temp files; disable swap for audio buffers if
  feasible.
- Use TLS/VPN for remote STT; authenticate the inference endpoint.
- Verify wake-word/Piper/Whisper model checksums and provenance.
- Add a wake-word confidence threshold and push-to-talk fallback (already planned).
- Define transcript retention and per-conversation deletion.

### SEC-26 — Projects, documents, and Markdown (Medium)

**Evidence:** `PLAN.md` plans Markdown project files under `data/projects/`, a Markdown
editor/viewer, and export. Exact file naming is unspecified.

**Risks:** Stored/exported Markdown containing HTML/JavaScript could execute in a viewer;
user-supplied titles could cause path traversal or collisions; exports may carry sensitive
data to unsafe destinations.

**Recommendation:**
- Never render raw HTML; sanitize Markdown with a strict allowlist (or render as plain text).
- Derive filenames from server-generated IDs, not titles; normalize and confine paths under
  `projects_path`.
- Apply the same XSS/CSP controls as the chat UI.
- Treat exported files as sensitive; warn users and avoid embedding secrets.

### SEC-27 — Deployment hardening gaps (Medium)

**Evidence:** `docs/deployment.md` runs the service as user `pi` with access to the home
directory, and the systemd unit has no sandboxing directives. `.env` permissions are not
specified.

**Risks:** A compromised service or plugin gets broad host access. Secrets may be readable
by other local users.

**Recommendation:**
- Create a dedicated `bbot` system user with no shell/home access.
- `chmod 600 .env`; keep config/database under that user.
- Add systemd hardening: `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=strict`,
  `ProtectHome=true` (with explicit `ReadWritePaths`), `RestrictAddressFamilies`,
  `MemoryDenyWriteExecute`, and a tight `CapabilityBoundingSet`.
- Add a firewall; expose only the reverse proxy.
- Use systemd credentials or a secrets manager for provider tokens.
- Keep the service on loopback behind Tailscale/Caddy as already recommended.

### SEC-28 — Plaintext transport to remote inference (Medium)

**Evidence:** Defaults use `http://` for LLM and STT (`app/core/config.py:21,34`,
`.env.example:12,17`, `config.yaml.example`). The plan relies on a LAN inference machine.

**Impact:** Prompts, transcripts, and API keys cross the network unencrypted; a
man-in-the-middle on the LAN can read or alter them.

**Recommendation:**
- Default examples to HTTPS and document certificate handling.
- If plain HTTP is intentional on a trusted link, gate it behind an explicit
  `allow_insecure_transport` flag and warn at startup.
- Prefer WireGuard/Tailscale or a private VLAN.
- Do not disable TLS verification; consider pinning for the inference host.

### SEC-29 — Scheduler input validation (Low)

**Evidence:** `PLAN.md` plans natural-language reminders and recurring chores with persisted
jobs.

**Risks:** Reminder/chore spam, invalid cron expressions, timezone/DST errors, and unbounded
recurring jobs.

**Recommendation:** Cap jobs per household, validate schedules against a strict grammar,
enforce minimum intervals, handle timezones explicitly, and rate-limit creation.

### SEC-30 — Data retention and deletion policy (Low)

**Evidence:** Transcripts are retained indefinitely; `docs/voice.md` only says audio is
discarded. Backups and audit logs have no retention policy.

**Recommendation:** Define retention for conversations, transcripts, notifications, events,
and audit logs; provide “delete conversation” (already implemented) and later a household
“delete all data” path that also purges backups.

---

## Controls working well

- **Fail-closed authentication:** empty configuration rejects all API access
  (`app/deps.py:32-36`).
- **Constant-time token comparison** (with the non-ASCII caveat in SEC-12).
- **`/api` routers protected by a shared dependency** (`app/api/chat.py:23-27`,
  `app/api/settings.py:13-17`), reducing the chance of forgetting auth on a new route.
- **Secret redaction** in the settings response (`app/core/config.py:68-77`).
- **Parameterized SQL** throughout `app/core/database.py`.
- **`yaml.safe_load`** for configuration (`app/core/config.py:125`).
- **Safe client rendering:** messages and titles use `textContent`, not `innerHTML`
  (`frontend/app.js:84`, `:99`, `:172`).
- **No secrets in git:** `.env`, `config.yaml`, databases, and backups are ignored.
- **LAN-first defaults:** `host` defaults to `127.0.0.1`; CORS is off; local LLM is disabled.
- **Output bound:** `max_tokens` defaults to 1024, limiting runaway generation.
- **Error handling for disconnects:** partial replies are persisted or discarded
  deliberately (`app/api/chat.py:141-148`).

## Prioritized remediation roadmap

### Before exposing beyond `127.0.0.1` (do first)

1. SEC-01 — remove the placeholder token; validate token strength at startup.
2. SEC-02 — add reverse-proxy rate limits and auth backoff.
3. SEC-03 — fix CORS construction and use an explicit origin allowlist.
4. SEC-06/SEC-07 — add security headers/CSP; disable or protect `/docs` and `/openapi.json`.
5. SEC-28 — document/require TLS or VPN for the API and inference endpoints.
6. SEC-27 — dedicated service user, `.env` permissions, systemd hardening.

### Before milestone 4 (plugins, chores, notifications)

7. SEC-20 — design plugin isolation and capability brokering before writing the loader.
8. SEC-21/SEC-22 — define tool allowlists, argument validation, and a bound confirmation
   protocol.
9. SEC-14 — audit auth failures, settings changes, deletions, and tool calls.
10. SEC-23 — secret storage, SSRF protections, recipient allowlists, notification rate limits.
11. SEC-08 — add a lockfile and `pip-audit` to CI.

### Before milestone 5–6 (voice, devices)

12. SEC-25 — audio lifecycle, transport security, model integrity, mute controls.
13. SEC-24 — secure defaults for MQTT/HA/GPIO and device allowlists.
14. SEC-26/SEC-30 — Markdown sanitization, safe filenames, retention/deletion policy.
15. SEC-09 — data-at-rest permissions and encrypted backups.

## Verification checklist

Add automated tests/CI checks for:

- Authentication on every new route (including docs, if kept).
- Startup failure on empty/short/placeholder tokens.
- CORS startup with `allow_cors` both false and true.
- Non-ASCII and malformed `Authorization` headers return 401, not 500.
- Rate-limit and body-size behavior at the proxy and in-app.
- Conversation history truncation and maximum sizes.
- Upstream error redaction (no internal URL/body leakage).
- Plugin permission denials, timeouts, and audit entries (when implemented).
- Prompt-injection fixtures for tool-calling paths (when implemented).
- Dependency audit (`pip-audit`) and secret scanning in CI.

## Assumptions and out of scope

- The service is intended for a trusted household LAN and is not currently internet-facing.
- The inference machine and its network path are trusted today.
- Physical access to the Pi, microphone, and speakers is controlled by the household.
- No multi-tenant or per-member authentication is implemented by design.
- This review covers the repository at the stated revision; future milestones require a
  follow-up audit, especially before plugins and device control ship.
