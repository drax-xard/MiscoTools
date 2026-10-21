# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions are project-wide: a release covers every tool in the collection.

## [Unreleased]

### Added

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
[0.1.0]: https://github.com/drax-xard/MiscoTools/tree/921a895
