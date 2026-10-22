# MiscoTools

**A collection of small random tools for whatever is needed at the moment.**

## Directory

### [B-BOT Lite](B-BOT-Lite/index.html)

A lightweight, dependency-free everyday AI assistant. Connects directly to any OpenAI-compatible endpoint, streams replies, and keeps the conversation in your browser.

### [B-BOT Advanced](B-BOT-Advanced/README.md)

Always-on, modular assistant runtime for a Raspberry Pi or similar device. Uses a remote OpenAI-compatible LLM, local voice interaction, plugins, reminders, home automation, and a project workspace. The FastAPI backend, streamed chat MVP, SQLite storage, and web client are in place. See the [development plan](B-BOT-Advanced/PLAN.md).

### [LlamaTune](LlamaTune/index.html)

Estimate the best `llama.cpp` `llama-server` launch flags for your GPU, RAM, and GGUF model. Generates an optimized launch command and memory plan for speed-first, balanced, or context-first use, reads model metadata directly from local GGUF files, supports separate K/V cache quantization, and saves presets as bash scripts.

## Shared

The [Shared](Shared) folder holds information useful to more than one tool.

- [Shared/docs/gguf.md](Shared/docs/gguf.md) - Reference documentation about the GGUF file format.
