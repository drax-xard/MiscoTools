# Dilstout — Roadmap

Milestones are sequential. Each one ends with passing tests and a short note in the
changelog. Scope is intentionally small per milestone so the engine is proven before UI and
audio work begins.

Status legend: `planned` · `in progress` · `done`

## M0 — Design (done)

- [x] Requirements captured and clarified.
- [x] Runtime and language evaluated.
- [x] Formats and architecture decided.
- [x] Voice approach evaluated.
- [x] README, design document, roadmap written.

## M1 — Scaffold and core engine

**Status:** done

No UI. No build step. No dependencies. Runnable with `node --test` (Node 22.14+ for JSON
module imports). Verified with its 49 tests, included in the current 58-test suite.

### Deliverables

| File | Purpose |
|---|---|
| `schemas/lap.schema.json` | v1 `.lap` schema: `meta`, `phonology` (inventory with articulatory features, romanization→IPA, prosody, join rules), `lexicon`, `person`, `place`, `organization`, `domain`, `weights`, `voice`. |
| `schemas/lpp.schema.json` | `.lpp` preset schema: packs + weights/overrides, seed, strategy, renderer, reserved `blendStrength`, pack-version `pins`. |
| `schemas/plugin-manifest.schema.json` | Plug-in manifest with `apiVersion` and `capabilities`. |
| `core/rng.js` | Seeded mulberry32; shareable seed codes. |
| `core/registry.js` | Registries for mix strategies, renderers, speakers, prosody, slot resolvers, phoneme resolvers, categories, importers, validators. |
| `core/lap.js` | Load, validate, normalize, migrate `.lap`. |
| `core/preset.js` | `serializeLpp`, `parseLpp`, `presetHash`; lossless round-trip. |
| `core/mixer.js` | Active pack set, normalized weights, per-category overrides. |
| `core/mix-strategies/weighted-lottery.js` | v1 strategy. |
| `core/mix-strategies/crossover.js` | Documented stub fixing the contract. |
| `core/mix-strategies/strand-blend.js` | Documented stub fixing the contract. |
| `core/morphology.js` | Data-driven join rules: elision, assimilation, duplication, replacement, insertion, plus spacing/hyphen/case handling. |
| `core/validate.js` | Phonotactic checks, retry/relax loop, warnings. |
| `core/engine.js` | Generation pipeline and result contract. |
| `core/renderers/plain.js` | ASCII-safe romanized renderer. |
| `core/speakers/` | Interface and documentation only; no synthesis. |
| `packs/test-synthetic.lap` | Exercises every slot, rule, and phoneme field. |
| `tests/*.test.js` | Full core test suite. |
| `docs/lap-authoring-guide.md` | Research checklist, IPA and transliteration conventions, licensing and ethics. |
| `docs/plugin-api.md` | Extension points and trusted-code model. |

### Frozen contracts

```js
selectSource({ category, slot, laps, rng, state }) -> lapId
resolvePhonemes({ text, lapId, context }) -> [{ symbol, features, lapId }]
render({ parts, lapId, style }) -> string
speak({ phonemes, prosody, voice }) -> Promise<void>   // interface only
generate({ laps, preset, category, count, seed })
  -> [{ name, phonemes, category, seed, provenance, warnings }]
```

### Acceptance criteria

- [x] `.lpp` save/load is lossless: weights, overrides, seed, strategy, renderer, and pins.
- [x] Same `.lpp` + seed + pack versions produce byte-identical output.
- [x] No `Math.random()` in `core/`; all draws use the injected RNG.
- [x] 1,000 generated names contain no `{slot}`, `null`, or `undefined`.
- [x] Batch count and dedupe respected.
- [x] Lottery distribution within ±2% of configured weights over 10,000 draws.
- [x] Every output phoneme and every rendered character is traceable to a source pack/slot.
- [x] Phoneme, prosody, and `voice` fields validate and survive a `.lpp` round-trip.
- [x] `node --test` passes with zero dependencies.

## M2 — Starter language packs

**Status:** done

Verified by `tests/packs.test.js`: both packs load, contain no out-of-inventory symbols,
declare only resolvable slots, and produce 100 unique warning-free names per category.

- [x] `packs/ancient-babylonian.lap` with sources, license, IPA inventory, romanization map, and prosody.
- [x] `packs/aztec.lap` with the same depth (Nahuatl naming conventions).
- [x] Category templates cover person, place, organization, and all six domain types.
- [x] Every declared slot resolves in both packs.
- [x] Every template validates and generates at least 100 unique names per category.
- [x] Pack-quality checklist added to the authoring guide and applied to both packs.

## M3 — Web UI, Gallery, Studio

**Status:** done

Verified with `tests/ui-format.test.js` and `tests/browser-smoke.mjs`, covering pack load,
generation, provenance, preset save/export/reload/load, and the Studio edit/import/export flow.

- [x] `index.html`, `ui/app.js`, `ui/mixer.js`, `ui/results.js`, `ui/gallery.js`, `ui/studio.js`.
- [x] Mixer: add/remove packs, weight sliders, per-category overrides, strategy and renderer selectors.
- [x] Results: batch size, copy, CSV/text export, provenance detail.
- [x] Gallery: save/load/export `.lpp`, bundled presets, missing-pack warnings from `pins`.
- [x] Studio: schema-generated form, live preview, validation panel, CSV/text import, `.lap` export.
- [x] Responsive layout consistent with LlamaTune and B-BOT Lite.
- [x] Browser smoke test for load → mix → generate → save preset → reload.

## M4 — Plug-in host

**Status:** planned

- [ ] Manifest loading and `apiVersion` gate.
- [ ] `plugins/` example plugin exercising a custom slot, a custom exporter, and a UI panel.
- [ ] `docs/plugin-api.md` completed with a worked example.
- [ ] Trust model documented in the UI at the point of loading a JS plug-in.
- [ ] Tests for registry collisions and API-version rejection.

## M5 — Voice prototype

**Status:** planned

- [ ] `core/speakers/prosody.js`: weighted interpolation of tempo, pitch, vowel length, stress bias.
- [ ] Web Speech speaker behind the `speak()` interface for a cheap concept check.
- [ ] Evaluate intelligibility and whether interpolation is audible.
- [ ] Decision note: proceed with formant synthesizer, adjust, or stop.

## M6 — Formant synthesizer

**Status:** planned

- [ ] Klatt-style formant speaker driven by articulatory features from `.lap` inventories.
- [ ] Phoneme realization uses provenance, so audio matches the written name.
- [ ] `blendStrength` from 0 to 1 controls hybrid accent intensity.
- [ ] Optional eSpeak-NG WASM plug-in (documented license implications).
- [ ] Optional cloud TTS plug-in.
- [ ] Accuracy fixtures: phoneme → formant parameter snapshots.

## M7 — Optional desktop packaging

**Status:** planned

- [ ] Tauri wrapper reusing the static UI.
- [ ] Native open/save dialogs for `.lap` and `.lpp`, file associations.
- [ ] Load plug-ins from an on-disk `plugins/` folder.
- [ ] Reproducible builds for Linux, macOS, and Windows.

## M8 — Portable SDK

**Status:** planned, post-v1. Work begins only after M0–M7 are complete.

This milestone is recorded so the proposed distribution plan is not lost, but it does not
change the scope, order, runtime, formats, or acceptance criteria of M0–M7. No Rust port,
native build, or SDK work starts early. If the SDK needs engine logic outside JavaScript,
that port is part of M8.

### Proposal

Ship the core as an embeddable native library: a stable C ABI plus a header-only C++ wrapper,
with JSON as the only boundary. Port the UI-agnostic core to Rust as the single native
implementation; JavaScript remains the reference and web engine. Data-only `.lap`/`.lpp`
extension; no JS plug-ins. Engine handles are immutable and shareable across threads. Proposed
code license is dual MIT OR Apache-2.0, subject to the open project-license decision. Later
bindings (Python, WASM, C#, engine wrappers) reuse the same contract.

### Deliverables

| Artifact | Purpose |
|---|---|
| `sdk/spec/api-v1.md` | Request/response contract, error codes, ownership, threading. |
| `sdk/spec/request.schema.json`, `response.schema.json` | Machine-readable envelopes. |
| `sdk/spec/conformance/` | Packs, presets, seeds, and expected JSON from the JS reference. |
| `sdk/rust/crates/dilstout-core/` | Pure Rust port of the UI-agnostic engine. |
| `sdk/rust/crates/dilstout-ffi/` | `cdylib` C ABI and generated header. |
| `sdk/include/dilstout.h` | Stable C header generated by `cbindgen`. |
| `sdk/cmake/DilstoutConfig.cmake` | CMake package for C++ consumers. |
| `sdk/examples/cpp/character_creation.cpp` | Minimal game-facing example. |
| `sdk/rust/crates/dilstout-wasm/`, `dilstout-python/` | Later bindings over the same core. |

### Phases

- [ ] Spec, error taxonomy, and conformance fixtures.
- [ ] JS portability pass: remove locale/runtime coupling, add `nextSeed`, publish ESM/npm package.
- [ ] Rust core port with full fixture parity.
- [ ] C ABI, C++ RAII wrapper, CMake config, static/shared builds.
- [ ] Linux/macOS/Windows release matrix (x64 and arm64).
- [ ] Python and WASM bindings.
- [ ] Optional C#/Unity and Godot wrappers.
- [ ] License and pack-provenance audit before shipping artifacts.

### Acceptance criteria

- [ ] Same engine version + pack versions + preset + seed produces byte-identical JSON in JS,
  Rust, and the C++ example.
- [ ] 10,000 generated names contain no `{slot}`, `null`, or `undefined`.
- [ ] Invalid packs, presets, and requests return structured errors; no panic crosses the ABI.
- [ ] No leaks or undefined behavior under ASan/valgrind and malformed-input fuzzing.
- [ ] One immutable engine handle supports concurrent generation from multiple threads.
- [ ] A C++ consumer can load packs and generate a name in roughly 20 lines.
- [ ] Every shipped pack declares `license` and `sources`.
- [ ] No SDK work starts before M0–M7 are complete.

## Backlog and future ideas

- Additional packs (Norse, Ancient Greek, Sumerian, Quechua, Yoruba, etc.).
- Additional mix strategies: template crossover, strand blend, "chaos" mode.
- Renderer plug-ins: diacritics, native scripts, RTL and CJK.
- Name meaning/gloss generation from lexicon data.
- Family trees and dynasties: generate related names with shared morphemes.
- Maps: place names positioned on a generated region.
- Importers for onomastic datasets and Wikipedia tables.
- Share links with embedded preset and seed (URL fragment).
- CLI (`node bin/dilstout.js`) sharing the same core.
- WASM-sandboxed plug-ins.
- Localization of the UI itself.
- Accessibility pass: keyboard mixing, screen-reader labels for generated names.

## Open decisions

| Question | Current stance |
|---|---|
| Project license | Undecided; must be settled before shipping bundled packs. |
| Bundled pack licensing | Per-pack `license` and `sources`; only redistributable sources. |
| Native script support | Deferred to a renderer plug-in; v1 is romanized only. |
| UI framework | None; vanilla ES modules. Revisit only if complexity demands it. |
| Whether to ship a CLI with v1 | Not planned; core is already Node-runnable. |
| Tauri timeline | After the plugin host and voice work; not a v1 blocker. |
