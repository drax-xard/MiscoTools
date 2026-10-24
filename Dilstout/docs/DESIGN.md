# Dilstout — Design

**Codename:** Dilstout ("Naughty Tongue")

This document records the architecture and the decisions made during the initial design
session. It is the reference for implementation; the milestone order lives in
[ROADMAP.md](ROADMAP.md).

## 1. Principles

1. **Portable and standalone.** No install, no build step, no network. Runs from a folder or
   a static host. Offline by default.
2. **Data over code.** Language details live in `.lap` JSON. Adding a culture should not
   require touching the engine.
3. **Customizable customization.** Mixing strategies, renderers, categories, and speakers are
   registries. The tool that customizes the tool is itself extensible.
4. **Deterministic.** A preset plus a seed reproduces a name exactly. Every random draw flows
   through one seeded PRNG.
5. **Explainable.** Every generated name records which pack and slot produced each part.
6. **Respectful.** Packs declare sources, license, and scope. The authoring guide treats
   cultures as systems to study, not costumes to caricature.

## 2. Runtime and language

### Decision

**Vanilla JavaScript/TypeScript with ES modules and no bundler for v1.** Optional **Tauri**
wrapper later. The core is UI-agnostic and runnable under Node for tests.

### Options considered

| Option | PRO | CON | Verdict |
|---|---|---|---|
| Vanilla JS/TS + static HTML | Zero install, OS-agnostic, matches repo, natural plug-in API via modules, offline PWA | File System Access API is Chromium-first; no OS file associations; weak sandboxing | **Chosen** |
| Tauri | 5–10 MB native binary, native dialogs/associations, on-disk plug-ins, reuses web UI | Rust toolchain, per-OS builds, slower contributor ramp | **Phase 2** |
| Electron | Mature desktop | 100 MB+ bundles, contradicts portability | Rejected |
| Python + PySide6 | Fast development, rich widgets, importlib plug-ins | Packaging per OS, Qt size/licensing, less polished UI | Rejected |
| Python + Tkinter | Stdlib only | Dated UI, poor drag-and-drop mixing | Rejected |
| Rust + egui/Slint | Tiny fast binary, WASM plug-ins | Slowest development, immature GUI ecosystem | Rejected |
| C# Avalonia / JavaFX | Cross-platform GUI | Runtime and build complexity | Rejected |

Rationale: the repository already ships dependency-free static apps (LlamaTune, B-BOT Lite)
and a dependency-free Python CLI (GitView). Dilstout's core is data transformation plus a
DOM UI, which is a natural fit for the browser. Tauri can wrap the same UI later when native
file handling becomes worth the build matrix.

## 3. File formats

### 3.1 Language Pack — `.lap`

UTF-8 JSON with a `.lap` extension, validated by `schemas/lap.schema.json`. A future version
may become a zip container (`manifest.json` + assets) only if packs need fonts or audio; v1
stays plain JSON.

```jsonc
{
  "format": "dilstout.lap",
  "version": 1,
  "meta": {
    "id": "ancient-babylonian",
    "name": "Ancient Babylonian",
    "culture": "Akkadian / Old Babylonian",
    "era": "c. 2000–1600 BCE",
    "author": "",
    "license": "",
    "sources": [],
    "notes": ""
  },
  "phonology": {
    "inventory": [
      { "symbol": "b", "type": "consonant", "place": "bilabial", "manner": "stop", "voicing": "voiced" },
      { "symbol": "a", "type": "vowel", "height": "open", "backness": "central", "rounded": false, "length": "short" }
    ],
    "romanization": { "š": "ʃ", "ā": "aː" },
    "phonotactics": { "onsets": [], "nuclei": [], "codas": [], "notes": "" },
    "prosody": {
      "stress": "penultimate",
      "syllableTemplate": "CVC",
      "tempo": 1.0,
      "vowelLengthDistinctive": true,
      "tone": null
    },
    "joinRules": [
      { "type": "elideVowel", "from": "a", "to": "", "when": "beforeVowel" }
    ]
  },
  "lexicon": {
    "roots": { "bāb": ["gate"], "il": ["god"] },
    "prefixes": [],
    "suffixes": [],
    "epithets": [],
    "honorifics": []
  },
  "person": {
    "given": { "male": [], "female": [], "neutral": [] },
    "surnamePatterns": [],
    "order": "given-family",
    "gendered": true,
    "patronymic": null,
    "templates": []
  },
  "place": {
    "settlementTypes": [],
    "terrainMorphemes": [],
    "directionalAffixes": [],
    "templates": []
  },
  "organization": {
    "religious": [],
    "political": [],
    "military": [],
    "guild": []
  },
  "domain": {
    "nation": [],
    "kingdom": [],
    "empire": [],
    "province": [],
    "district": [],
    "town": []
  },
  "weights": {
    "componentWeights": {},
    "categoryBias": {}
  },
  "voice": {
    "preferredSpeaker": "formant",
    "basePitch": 110,
    "rate": 1.0
  }
}
```

Phoneme inventory, romanization→IPA mapping, and prosody are included in v1 even though no
audio ships in v1. This avoids a schema migration and re-authoring every pack at the voice
milestone.

### 3.2 Preset — `.lpp`

UTF-8 JSON with a `.lpp` (Language Pack Preset) extension, validated by
`schemas/lpp.schema.json`.

```jsonc
{
  "format": "dilstout.lpp",
  "version": 1,
  "name": "Babylonian / Aztec 50-50",
  "laps": [
    { "id": "ancient-babylonian", "weight": 0.5, "overrides": { "place": 0.7 } },
    { "id": "aztec", "weight": 0.5, "overrides": { "person": 0.7 } }
  ],
  "seed": "dilstout-7f3a",
  "strategy": "weighted-lottery",
  "renderer": "plain",
  "blendStrength": 0.5,
  "pins": { "ancient-babylonian": 1, "aztec": 1 },
  "createdAt": "2026-10-24T00:00:00Z"
}
```

`blendStrength` is reserved for the voice milestone. `pins` records pack schema versions so a
preset can warn when a pack changes underneath it.

### 3.3 Plug-in manifest

```jsonc
{
  "format": "dilstout.plugin",
  "id": "example-hooks",
  "name": "Example Hooks",
  "version": "0.1.0",
  "apiVersion": 1,
  "entry": "index.js",
  "capabilities": ["slot", "exporter", "uiPanel"]
}
```

## 4. Architecture

```
index.html
core/
  rng.js              seeded PRNG and shareable seed codes
  registry.js         named registries for all extension points
  lap.js              load, validate, normalize, migrate .lap
  preset.js           serialize / parse / hash .lpp
  mixer.js            active pack set, normalized weights, overrides
  mix-strategies/
    weighted-lottery.js
    crossover.js      documented stub, deferred
    strand-blend.js   documented stub, deferred
  morphology.js       data-driven join and prosody rules
  validate.js         schema + phonotactic validation, retry/relax
  engine.js           the generation pipeline
  renderers/plain.js
  speakers/           interface only in v1; synthesis later
ui/
  app.js mixer.js gallery.js studio.js results.js
plugins/
packs/
presets/
schemas/
docs/
tests/
```

### 4.1 Registries

Everything user-extensible is a named registry, so the "customization tool" itself can be
customized:

```js
registry.mixStrategies.register("weighted-lottery", fn);
registry.renderers.register("plain", fn);
registry.speakers.register("formant", fn);
registry.prosody.register("heuristic", fn);
registry.slotResolvers.register("root", fn);
registry.phonemeResolvers.register("romanization", fn);
registry.categories.register("person", spec);
registry.importers.register("csv", fn);
registry.validators.register("phonotactics", fn);
```

### 4.2 Extension points

| Point | Signature | v1 |
|---|---|---|
| Mix strategy | `selectSource({category, slot, laps, rng, state}) -> lapId` | `weighted-lottery`; stubs for crossover and strand blend |
| Renderer | `render({parts, lapId, style}) -> string` | `plain` |
| Phoneme resolver | `resolvePhonemes({text, lapId, context}) -> [{symbol, features, lapId}]` | `romanization` |
| Speaker | `speak({phonemes, prosody, voice}) -> Promise<void>` | Interface only |
| Prosody | `prosody({laps, weights, context}) -> prosody` | Interface only |
| Slot resolver | `resolve({slot, lap, rng, state}) -> string` | Built-ins for the v1 slot vocabulary |
| Category | spec describing templates, required slots, output shape | Person, place, organization, domain |
| Importer | `import(file) -> Partial<Lap>` | CSV/text planned for Studio (M3) |
| Validator | `validate(name, context) -> warnings[]` | Phonotactics, dedupe |

### 4.3 Slot vocabulary v1

`root`, `given`, `family`, `clan`, `honorific`, `epithet`, `prefix`, `suffix`,
`settlementSuffix`, `terrain`, `directional`, `orgType`, `domainType`, `numeral`, `article`.

Unknown slots are errors unless a plug-in registers a resolver. Plug-ins may also add new
categories.

### 4.4 Template grammar

```text
"{root}{settlementSuffix}"        concatenative
"{honorific} {given} of {clan}"   spaced
"{prefix}-{root}"                 hyphenated
```

Templates are strings with `{slot}` placeholders. Capitalization, spacing, and joining come
from the template plus the LAP's join rules; the renderer only handles final styling.

## 5. Generation pipeline

```
seed
  -> weight normalization (mixer + category overrides)
  -> category and template selection
  -> per-slot source selection (active mix strategy)
  -> slot resolution (LAP data)
  -> morphophonemic join (data-driven rules)
  -> phonotactic validation (retry, then relax and warn)
  -> dedupe within batch
  -> renderer
  -> { name, phonemes, provenance, warnings }
```

### 5.1 Result contract

```js
{
  name: "Bābilu-Itzcoatl",
  phonemes: [{ symbol: "b", features: {...}, lapId: "ancient-babylonian" }, ...],
  category: "person",
  seed: "dilstout-7f3a",
  provenance: [{ slot: "root", lapId: "ancient-babylonian", value: "bāb" }, ...],
  warnings: []
}
```

Provenance makes the planned "why this name" panel and the voice blend free: the same
per-phoneme source assignments drive both explanation and synthesis.

### 5.2 Determinism

- One seeded mulberry32/xoshiro instance per generation; `Math.random()` is forbidden in core.
- Stable seed codes: `"dilstout-7f3a"` round-trips to the same numeric seed.
- Same `.lpp` + seed + pack versions → byte-identical output.
- Preset hashing uses canonical JSON (sorted keys) so share links are stable.

### 5.3 Mixing strategies

**v1 — per-slot weighted lottery.** For each template and slot, pick the source LAP by
`weight × categoryOverride`, normalized. Different slots can draw from different packs,
which is what makes controlled hybrids possible.

**Planned — template crossover.** One pack supplies the template; other packs supply the
morphemes for its slots. Produces more surprising hybrids than a lottery.

**Planned — whole-name strand blend.** Generate complete names from each pack separately and
cross-breed the results. Simpler conceptually, less controllable, useful as a "chaos" mode.

All three implement the same `selectSource` interface, so switching is a setting, not a
rewrite. The multi-strategy modules ship as stubs in v1 to fix the contract early.

### 5.4 Morphophonemics

Join rules are data, not code, so packs remain pure JSON:

```jsonc
{ "type": "elideVowel", "from": "a", "to": "", "when": "beforeVowel" }
{ "type": "assimilate", "from": "n", "to": "m", "when": "beforeLabial" }
{ "type": "harmonize", "vowels": ["a", "e", "i"], "trigger": "backness" }
```

Rules run in declaration order at join boundaries, followed by template-level capitalization
and spacing.

## 6. Voice and vocalization (future)

### Concept

Reproduce actual audio of generated names, extrapolated from the blended preset: what would a
50/50 Babylonian/Aztec mix sound like?

### Model

1. Build a **weighted union** of the packs' phoneme inventories using the same weights and
   overrides as generation.
2. Interpolate scalar prosody (tempo, pitch, vowel length, stress bias); keep categorical
   articulatory features (place, manner, voicing) as weighted distributions.
3. At synthesis, realize each phoneme from the name's provenance, so the spoken name matches
   the written one.
4. `blendStrength` from 0 (dominant-accent) to 1 (fully interpolated hybrid) scales how much
   the minority pack affects articulation.

### Synthesis options

| Approach | PRO | CON | Role |
|---|---|---|---|
| Custom formant synthesizer (Klatt-style) | MIT-compatible, tiny, driven directly by articulatory features, true interpolation | Robotic; per-class tuning needed | **Default** |
| Web Speech API | Zero-code prototype, offline, OS voices | No phoneme control, cannot blend accents | Prototype only |
| eSpeak-NG WASM | Accepts IPA, intelligible, offline | GPLv3 bundling, 2–4 MB, fixed language voices | Optional plug-in |
| Piper/ONNX TTS | Natural quality | Tens of MB, fixed voices, cannot blend phoneme systems | Rejected for blending |
| Cloud TTS | Best quality | Breaks offline/portable promise | Optional plug-in |

The custom formant synthesizer is the only option that fulfills the actual promise: a voice
derived from blended articulatory features rather than a stock language voice.

## 7. Plug-ins and trust

v1 scope: **data plus JS hooks**.

- Plug-ins are ES modules loaded with `import()`, either bundled, pasted by the user, or (in
  the Tauri build) read from `plugins/`.
- A manifest declares `apiVersion` and `capabilities`; the host refuses unknown API versions.
- JS plug-ins are trusted code. This is documented explicitly; there is no sandbox in v1.
- Data-only packs/presets are inherently safe and remain the lowest-friction extension path.
- Sandboxed WASM plug-ins are a possible future upgrade; they are not worth the v1 complexity.

## 8. UI surfaces

- **Mixer.** Add/remove LAPs, drag weights, per-category overrides, strategy and renderer
  selectors, `blendStrength` placeholder.
- **Results.** Batch count, copy, CSV/text export, provenance detail, "why this name".
- **Gallery.** Save/load/export `.lpp`, bundled presets, missing-pack warnings using `pins`.
- **Studio.** Form generated from the JSON Schema, live preview, validation panel, CSV/text
  import, `.lap` export, and a concise research guide.

## 9. Testing strategy

Node's built-in test runner, zero dependencies:

- RNG sequence reproducibility, seed-code round-trip.
- Schema validation, including clear error paths for missing fields.
- `.lpp` lossless round-trip.
- Weight normalization and per-category override behavior.
- Lottery distribution within tolerance over 10k draws.
- 1,000-name generation with no `{slot}`, `null`, or `undefined` leakage.
- Morphophonemic fixture table.
- Byte-identical determinism for identical preset + seed + pack versions.
- Provenance completeness: every character and phoneme traceable to a source.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Thin pack data produces generic names | Pack quality checklist; mark packs `experimental` in meta |
| Over-mixing produces incoherent "mush" | Per-category overrides, category-aware defaults, explainability |
| Cultural insensitivity or misinformation | Authoring guide, mandatory sources/license, reviewer notes |
| Unicode and romanization complexity | Romanized-only v1; IPA stored separately; script renderers later |
| Chromium-first file access | Download/upload fallback for `.lap`/`.lpp`; Tauri wrapper later |
| Plug-in trust | Documented trusted-code model; data-only path encouraged; WASM later |
| Voice quality disappointment | Prototype with Web Speech first; formant synth as opt-in experimental |

## 11. Decisions log

| Decision | Choice | Date |
|---|---|---|
| Primary runtime | Static vanilla JS/TS, no bundler | 2026-10-24 |
| Desktop wrapper | Tauri later, not Electron | 2026-10-24 |
| Plugin model v1 | Data + JS hooks, trusted code | 2026-10-24 |
| Preset extension | `.lpp` | 2026-10-24 |
| v1 mix strategy | Per-slot weighted lottery + category overrides | 2026-10-24 |
| Alternate strategies | Crossover and strand blend as later strategy modules | 2026-10-24 |
| v1 output | Plain romanized text | 2026-10-24 |
| Style variants | Diacritics and native scripts via renderer plug-ins | 2026-10-24 |
| Phoneme schema | Included in v1, audio later | 2026-10-24 |
| Default voice | Custom formant synthesizer; eSpeak/cloud as plug-ins | 2026-10-24 |
| Starter packs | Ancient Babylonian + Aztec, plus synthetic test pack | 2026-10-24 |
