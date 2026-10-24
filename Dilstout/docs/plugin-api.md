# Dilstout Plugin API (v1)

Dilstout is extended through named registries. Every extension point can be replaced or added
to without editing the engine. This document is the contract for the v1 API.

> Status: the v1 host ships in M4. It loads bundled plugins from `plugins/index.json`, loads
> single-file local plugins from disk, enforces the API version, rolls back failed
> registrations, and supports unloading. The bundled `plugins/example-hooks` demonstrates
> every extension point below.

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
  "capabilities": ["slot", "category", "exporter", "uiPanel"],
  "author": "",
  "license": "",
  "description": ""
}
```

The host refuses to load a manifest whose `apiVersion` does not match the host API version
(currently `1`). Capabilities document intent; they are not a permission system.

## Registration

A plugin entry module exports a `manifest` object and a `register(context)` function. The
context contains a scoped `registry`, the `manifest`, the host `apiVersion`, and a `host`
object with a namespaced `log()`.

```js
export const manifest = {
  format: 'dilstout.plugin',
  id: 'my-plugin',
  name: 'My Plugin',
  version: '0.1.0',
  apiVersion: 1,
  entry: 'index.js',
  capabilities: ['slot'],
};

export function register({ registry, manifest, apiVersion, host }) {
  host.log('registering', manifest.id, 'for API', apiVersion);
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
- Registrations are tracked. If `register()` throws, everything it registered is removed and
  the plugin is not listed as loaded.

## Loading

Bundled plugins are listed in `plugins/index.json`:

```json
[{ "id": "example-hooks", "manifest": "example-hooks/plugin.json" }]
```

The host fetches the manifest, resolves `entry` relative to that manifest, and imports the
module. Entry URLs include the plugin version so a reload picks up changes.

The UI can also load a local `.js` file after an explicit trust confirmation. Local plugins
must export their own `manifest`; relative imports do not work from a file-loaded module, so
bundle helpers into the same file or use a bundled plugin instead.

Load, list, and unload through `core/plugin-host.js`:

```js
const host = createPluginHost({ registry });
await host.loadBundled('plugins/index.json');
await host.loadFromFile(file);
host.list();
host.unload('my-plugin');
```

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

### Exporter — `registry.exporters`

Exporters appear as extra buttons in the results toolbar. `export` receives the current
result batch and returns the file contents.

```js
registry.exporters.register('markdown-table', {
  id: 'markdown-table',
  label: 'Markdown',
  export(results) {
    return {
      filename: `${results[0]?.seed ?? 'dilstout'}.md`,
      mime: 'text/markdown',
      text: results.map((result) => `- ${result.name}`).join('\n'),
    };
  },
});
```

### Importer — `registry.importers`

```js
{
  import(fileText) { return { /* partial lap */ }; }
}
```

### UI panel — `registry.uiPanels`

Panels mount in the Plugins tab. `mount(root, context)` receives a container and
`{ app, notify, host }`. `unmount(root)` is optional and runs before re-render or unload.

```js
registry.uiPanels.register('my-plugin.panel', {
  id: 'my-plugin.panel',
  label: 'My plugin',
  mount(root, { notify }) {
    const text = document.createElement('p');
    text.textContent = 'Hello from my plugin.';
    root.append(text);
    notify('Panel mounted.');
  },
  unmount(root) {
    root.replaceChildren();
  },
});
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
