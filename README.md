# MiscoTools

**A collection of small random tools for whatever is needed at the moment.**

## Directory

### [B-BOT Lite](B-BOT-Lite/index.html)

A lightweight, dependency-free everyday AI assistant. Connects directly to any OpenAI-compatible endpoint, streams replies, and keeps the conversation in your browser.

### [B-BOT Advanced](B-BOT-Advanced/README.md)

Always-on, modular assistant runtime for a Raspberry Pi or similar device. Uses a remote OpenAI-compatible LLM, local voice interaction, plugins, reminders, home automation, and a project workspace. The FastAPI backend, streamed chat MVP, SQLite storage, and web client are in place. See the [development plan](B-BOT-Advanced/PLAN.md).

### [Dilstout](Dilstout/README.md)

A portable, offline random name generator that mixes real language packs to create person, place, organization, and domain names. Packs define phonology, morphology, and naming conventions; the mixer blends them with per-category weights and saves mixes as `.lpp` presets. Ships with Ancient Babylonian and Aztec starter packs, a weight mixer, preset gallery, schema-driven LAP Studio, and a plugin host. No build step or dependencies.

### [GitView](GitView/README.md)

A dependency-free CLI that turns any local Git repository into a single self-contained HTML report. Includes commit history, activity charts, contributor and file-type breakdowns, a searchable file tree, instant commit search, and dark/light themes. Requires only Python 3.9+ and Git.

### [LlamaTune](LlamaTune/index.html)

Estimate the best `llama.cpp` `llama-server` launch flags for your GPU, RAM, and GGUF model. Generates an optimized launch command and memory plan for speed-first, balanced, or context-first use, reads model metadata directly from local GGUF files, supports separate K/V cache quantization and PrismML `PTQ1_0`/`PQ2_0` ternary schemes, and saves presets as bash scripts.

## Shared

The [Shared](Shared) folder holds information useful to more than one tool.

- [Shared/docs/gguf.md](Shared/docs/gguf.md) - Reference documentation about the GGUF file format.
