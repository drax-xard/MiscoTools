# Plugins

Third-party extensions will load from this folder in milestone M4. Nothing here is loaded
in v1; the registries and contracts already exist in `core/registry.js`, and are documented
in [../docs/plugin-api.md](../docs/plugin-api.md).

Until the host ships, plugins can be exercised by importing `core/index.js` and registering
extensions directly. Remember that JavaScript plugins are trusted code.
