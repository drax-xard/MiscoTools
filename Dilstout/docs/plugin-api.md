# Dilstout Plugin API (v1)

Dilstout is extended through named registries. Every extension point can be replaced or added
to without editing the engine. This document is the contract for the v1 API.

> Status: the registries and contracts exist. Loading third-party plugins from disk or a URL
> ships in M4. Until then, built-ins register through `core/index.js`.

## Trust model

JavaScript plugins are **trusted code**. They run with full access to the page, can read the
DOM, and can make network requests. Only load plugins you have reviewed. Data-only extensions
(`.lap` packs and `.lpp` presets) are the safe default; they cannot execute code.

There is no sandbox in v1. WASM-sandboxed plugins are a possible future upgrade.

## Manifest

A plugin ships a manifest validated by `schemas/plugin-manifest.schema.json`:

```json
{
  "format": "dilstout.plugin",
  "id": "example-hooks",
  "name": "Example Hooks",
  "version": "0.1.0",
  "apiVersion": 1,
  "entry": "index.js",
  "capabilities": ["slot", "renderer"],
  "author": "",
  "license": "",
  "description": ""
}
```

The host refuses to load a manifest whose `apiVersion` does not match the host API version.
Capabilities document intent; they are not a permission system.

## Registration

The host passes a registration context to the plugin entry module. In v1 the same object is
available as `registry` from `core/registry.js`.

```js
export const id = 'example-hooks';
export const apiVersion = 1;

export function register(context) {
  const { registry } = context;

  registry.slotResolvers.register(
    'totem',
    {
      available: (lap) => Array.isArray(lap.person?.totems) && lap.person.totems.length > 0,
      resolve: ({ lap, rng }) => ({ value: rng.pick(lap.person.totems) }),
    },
    { label: 'Totem' },
  );
}
```

Rules:

- IDs are unique within a registry. Duplicate registration throws.
- Unregister with `registry.<point>.unregister(id)`.
- Inspect built-ins with `registry.<point>.list()` and `.get(id)`.
- Never call `Math.random()`; use the `rng` passed to resolvers so generation stays
  reproducible.

## Extension points

### Mix strategy — `registry.mixStrategies`

```js
export const id = 'my-strategy';
export const label = 'My strategy';
export const description = 'One line for the UI.';
export const implemented = true;

export function selectSource({ category, slot, laps, rng, state, weights }) {
  // laps: eligible lap objects
  // weights: Map<lapId, normalizedWeight> for this category
  return laps[rng.weightedIndex(laps.map((lap) => weights.get(lap.meta.id)))].meta.id;
}
```

`state` is a mutable object shared across one generation call; use it for memory such as
avoiding immediate repeats.

### Renderer — `registry.renderers`

```js
export const id = 'diacritics';
export const label = 'Diacritics';
export function render({ text, segments, category }) {
  return text.normalize('NFC');
}
```

Renderers must not add or remove letters that carry meaning; provenance and phonemes are
computed from the pre-render segments.

### Slot resolver — `registry.slotResolvers`

```js
{
  available(lap) { return true; },
  resolve({ lap, rng, context, category }) {
    return { value: '...', gloss: '...', template: false };
  }
}
```

- Return a string or an object with `value`.
- `template: true` (or a `value` containing `{slot}`) makes the engine expand the result
  recursively, up to four levels.
- `gloss` is optional and appears in provenance.

### Phoneme resolver — `registry.phonemeResolvers`

```js
{
  resolve({ segments, lapMap, fallbackLap }) {
    return [{ symbol: 'a', grapheme: 'a', lapId: 'my-pack', features: { type: 'vowel' } }];
  }
}
```

v1 uses `romanization`, a greedy longest-match map from the pack's romanization table to IPA.

### Category — `registry.categories`

```js
{
  id: 'artifact',
  label: 'Artifact',
  genders: null,
  pools(lap) {
    return [{ id: 'weapon', templates: lap.artifacts?.weapon ?? [] }];
  }
}
```

Pools group templates by subtype (for example `religious`, `political`, `nation`). Each pool
is chosen proportionally; each template within a pool is drawn uniformly.

### Speaker — `registry.speakers` (interface only in v1)

```js
{
  async speak({ phonemes, prosody, voice }) {
    // synthesize audio
  }
}
```

### Prosody — `registry.prosody` (interface only in v1)

```js
{
  resolve({ laps, weights, context }) {
    return { tempo: 1, pitch: 110, stress: 'penultimate' };
  }
}
```

### Importer / exporter — `registry.importers`

```js
{
  import(fileText) { return { /* partial lap */ }; },
  export(lap) { return '.lap text'; }
}
```

### Validator — `registry.validators`

```js
{ validate(name, context) { return [{ code: 'style', message: '...' }]; } }
```

Codes in `FATAL_CODES` (`core/validate.js`) cause the engine to retry. Other codes become
warnings on the result.

## Versioning

- `apiVersion` is an integer. The host accepts exactly the versions it supports.
- Registries reject duplicate IDs, so plugins should prefix custom IDs when collisions are
  possible (`myplugin.totem`).
- Removing or renaming a built-in ID is a breaking change and requires a new API version.
