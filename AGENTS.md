# AGENTS.md - MiscoTools Repository

## Commands

### B-BOT Advanced (Python FastAPI backend)

**Start the server:**
```
b-bot           # from repo root (runs uvicorn.app.main:app)
# or:
cd backend && uvicorn app.main:app
```

**Health check (public, no auth):**
```
GET http://127.0.0.1:8000/health
```

**Auth required:** All `/api/*` endpoints require `Bearer` token. Missing/Invalid → 401/403. Token comes from `B_BOT_AUTH_TOKEN` env var or `config.yaml`. Unconfigured server fails closed (503).

**Reload during dev:**
```
b-bot --reload   # or: uvicorn app.main:app --reload
```

### B-BOT Lite (static web app)

**Open in browser:**
```
open B-BOT-Lite/index.html
```
No build step. Connects to any OpenAI-compatible endpoint configured in the browser UI.

### LlamaTune

```
open LlamaTune/index.html
```

### Testing (B-BOT Advanced)

```
cd backend && python -m pytest
# Run specific test:
python -m pytest tests/test_basics.py
# With verbose output:
python -m pytest -v
```

**Test fixtures:** `conftest.py` creates a temp config with `auth_token="test-token"`. Use `HEADERS = {"Authorization": "Bearer test-token"}` for authenticated requests. Health endpoint is public.

### Lint

```
cd backend && ruff check .
# Auto-fix:
cd backend && ruff check . --fix
```

## Architecture

- **Config loading order** (highest wins): `config.yaml` → `.env` → `B_BOT_*` environment variables
- **Auth**: Single household bearer token. All API endpoints depend on `require_auth` deps (`app/deps.py:23`). Public only: `GET /health`
- **Directory structure**: `backend/app/` is the FastAPI app package. `backend/tests/` holds pytest tests. `pyproject.toml` includes `app*` packages.
- **Database**: SQLite with WAL mode. FTS5 enabled if build supports it (silently falls back). `data/b-bot.db` by default, resolved relative to backend dir.
- **Entry point**: `app.main:run` or the `b-bot` console script (maps to `app.main:run` via pyproject.toml `[project.scripts]`)

## Environment

- Copy `.env.example` → `.env` and fill values. `.env` overrides `config.yaml`.
- Key env vars: `B_BOT_AUTH_TOKEN`, `B_BOT_AUTH_TOKEN_PREVIOUS`, `B_BOT_HOST`, `B_BOT_PORT`, `B_BOT_LLM_BASE_URL`, `B_BOT_LLM_MODEL`, `B_BOT_LLM_API_KEY`, `B_BOT_STT_BASE_URL`, `B_BOT_STT_MODEL`, `B_BOT_DATABASE_PATH`, `B_BOT_DOCS_ENABLED`, `B_BOT_ALLOW_INSECURE_TRANSPORT`, `B_BOT_RATE_LIMIT_PER_MINUTE`, `B_BOT_RETENTION_DAYS`
- If `B_BOT_AUTH_TOKEN` is empty, the server returns 503 on all authenticated routes

## LLM Efficiency Directives

- **BE CONCISE:** Respond directly without conversational filler, intros, or summaries of what you are about to do.
- **NO ECHOING:** Do NOT repeat back user code, system prompts, or tool outputs unless specifically requested.
- **DRY CODE:** When modifying files, output *only* the specific lines or functions being changed. Avoid returning full files when targeted diffs or edits suffice.

- **NO RECURSIVE REASONING:** If a tool call fails or returns an error, do NOT re-explain the error back and forth. Fix the call or ask for clarification in 1 sentence.
- **ONE-STEP TOOL CALLS:** Perform tool actions immediately rather than planning multiple hypothetical turns ahead in text.
- **THINKING CAP:** Keep internal reasoning/scratchpad thoughts under 150 words. Transition immediately to tool usage or final answer.

- **DO NOT AUTOLOAD LARGE DIRECTORIES:** Request targeted files rather than reading entire folders into context.
- **SUMMARY-FIRST READING:** When inspecting external documentation or logs, summarize findings in bullet points instead of ingesting full logs into response blocks.