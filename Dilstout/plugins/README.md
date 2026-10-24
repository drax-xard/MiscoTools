# Plugins

Bundled plugins load at startup from `index.json`, which points at each plugin's manifest.
The manifest names the entry module, and the entry module exports a `manifest` and a
`register(context)` function.

`example-hooks/` demonstrates every v1 extension point:

- a custom `syllable` slot resolver;
- a `syllable-chant` category;
- a Markdown exporter shown in the results toolbar;
- a UI panel shown under the Plugins tab.

Plugins are loaded through the host in `core/plugin-host.js`. The host validates manifests,
enforces `apiVersion`, rolls back registrations when a plugin fails, and supports unloading.
The UI can also load a single-file `.js` plugin from disk after a trust confirmation; that
file must export its own `manifest` because it has no companion `plugin.json`.

Plugins are trusted code. See [../docs/plugin-api.md](../docs/plugin-api.md).
