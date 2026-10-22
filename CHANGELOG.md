# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions are project-wide: a release covers every tool in the collection.

## [Unreleased]

### Added

- **B-BOT Advanced** backend foundation:
  - FastAPI service with a public `/health` endpoint and configurable
    `config.yaml` / `.env` loading.
  - Bearer-token authentication for all `/api` routes, failing closed when no token
    is configured.
  - SQLite storage in WAL mode with the planned data-model schema and FTS5 indexes.
  - Conversation list, create, rename, delete, streamed chat replies over SSE, and
    Markdown export.
  - Read-only settings endpoint with redacted secrets and an editable system prompt.
  - Dependency-free web chat client under `B-BOT-Advanced/frontend/`.
  - Architecture, plugin API, voice, deployment, and discovery documentation.
  - Pytest suite covering health, auth, conversation CRUD, streaming, export, and
    settings.

### Changed

- Renamed the static B-BOT assistant to **B-BOT Lite** and added the **B-BOT Advanced**
  development plan.
- Updated the B-BOT Advanced plan with the confirmed Pi 5 target, USB audio, bilingual
  English/Argentinian Spanish voice, remote Whisper `base`, plugin notifications, chore
  scoring, and smart LED/GPIO integration.

## [0.2.1] - 2026-10-22

### Added

- **LlamaTune** — local GGUF metadata loading that reads parameter count, native context,
  quantization, and KV geometry directly in the browser.
- Independent K and V KV cache quantization selectors with separate `--cache-type-k` and
  `--cache-type-v` flags and updated memory accounting.
- Preset export that downloads the generated launch command as a ready-to-run bash script.
- `Shared/docs/gguf.md` — official GGUF format and metadata specification reference.

### Changed

- Updated LlamaTune and collection documentation for the new GGUF, KV cache, and preset
  features.

## [0.2.0] - 2026-10-22

### Added

- **B-BOT** — standalone, dependency-free everyday AI assistant that connects directly to any
  OpenAI-compatible endpoint.
  - Endpoint, model, API key, temperature, token limit, and system-prompt settings.
  - Model discovery, streamed replies, stop, retry, copy, new chat, and Markdown export.
  - Safe built-in Markdown rendering, responsive layout, and browser-local chat persistence.
- `B-BOT-Lite/DESCRIPTION.md` — setup, compatible endpoints, CORS notes, privacy, and limitations.
- `LlamaTune/DESCRIPTION.md` — explains what the llama.cpp launch optimizer does, how to use
  it, how the memory estimate is computed, and its caveats.

## [0.1.0] - 2026-10-21

Initial release of the MiscoTools collection.

### Added

- **LlamaTune** — offline, single-page estimator that turns GPU VRAM, system RAM, and GGUF
  model details into an optimized `llama-server` launch command.
  - Configuration panels for hardware, model, and optimization target.
  - Memory budgeting of model weights, KV cache, and runtime/compute overhead across every
    GPU offload level, from CPU-only to full offload.
  - Speed, Balanced, and Context optimization strategies.
  - Generated `llama-server` command with a copy button, plus VRAM and system RAM
    memory-envelope breakdowns.
  - "Why this config" insights and a warnings list covering capped context, partial offload,
    RAM over-budget, and low-quality quantized KV cache.
  - Auto-detected KV cache geometry for Llama 3.x, Qwen 2/3, Mistral/Mixtral, Gemma 2/3,
    Phi, DeepSeek V2/V3/R1 (MLA), Command R, and Yi, with a custom geometry override.
- Root `README.md` listing the tools in the collection.

[Unreleased]: https://github.com/drax-xard/MiscoTools/commits/main
[0.2.1]: https://github.com/drax-xard/MiscoTools/tree/v0.2.1
[0.2.0]: https://github.com/drax-xard/MiscoTools/tree/v0.2.0
[0.1.0]: https://github.com/drax-xard/MiscoTools/tree/921a895
