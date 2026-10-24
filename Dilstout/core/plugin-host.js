import { registry as defaultRegistry } from './registry.js';
import { assertValid, validatePluginManifest } from './schema.js';

export const HOST_API_VERSION = 1;

const REGISTRY_NAMES = Object.keys(defaultRegistry);

export function validatePluginForHost(manifest) {
  assertValid(validatePluginManifest(manifest), 'Invalid plugin manifest');
  if (manifest.apiVersion !== HOST_API_VERSION) {
    throw new Error(
      `Plugin "${manifest.id}" targets API v${manifest.apiVersion}; this host supports v${HOST_API_VERSION}`,
    );
  }
  return manifest;
}

function createScopedRegistry(registry, record) {
  const scoped = {};
  for (const name of REGISTRY_NAMES) {
    const target = registry[name];
    scoped[name] = {
      register(id, value, meta) {
        const result = target.register(id, value, meta);
        record.added.push({ name, id });
        return result;
      },
      unregister(id) {
        return target.unregister(id);
      },
      has(id) {
        return target.has(id);
      },
      get(id) {
        return target.get(id);
      },
      getRecord(id) {
        return target.getRecord(id);
      },
      list() {
        return target.list();
      },
      ids() {
        return target.ids();
      },
    };
  }
  return scoped;
}

function rollback(registry, record) {
  for (let index = record.added.length - 1; index >= 0; index -= 1) {
    const entry = record.added[index];
    registry[entry.name].unregister(entry.id);
  }
  record.added = [];
}

function resolveBase() {
  return globalThis.location?.href ?? 'http://localhost/';
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.text();
}

export function createPluginHost({ registry = defaultRegistry, apiVersion = HOST_API_VERSION, logger = console } = {}) {
  const loaded = new Map();

  function contextFor(manifest, scopedRegistry, record) {
    const host = {
      apiVersion,
      log: (...args) => logger.log?.(`[plugin:${manifest.id}]`, ...args),
    };
    return {
      apiVersion,
      manifest,
      registry: scopedRegistry,
      host,
      record,
    };
  }

  function unload(id) {
    const handle = loaded.get(id);
    if (!handle) throw new Error(`Plugin "${id}" is not loaded`);
    try {
      handle.module?.unmount?.(handle.context);
    } finally {
      rollback(registry, handle.record);
      loaded.delete(id);
    }
  }

  async function loadFromModule(module, { source = 'local', manifestUrl = null } = {}) {
    const manifest = module.manifest ?? module.default?.manifest;
    if (!manifest) {
      throw new Error('Plugin module must export a "manifest" object');
    }
    validatePluginForHost(manifest);
    if (loaded.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already loaded`);
    }
    const register = module.register ?? module.default?.register;
    if (typeof register !== 'function') {
      throw new Error(`Plugin "${manifest.id}" must export a register() function`);
    }

    const record = { added: [] };
    const scopedRegistry = createScopedRegistry(registry, record);
    const context = contextFor(manifest, scopedRegistry, record);

    try {
      await register(context);
    } catch (error) {
      rollback(registry, record);
      throw error;
    }

    const handle = { id: manifest.id, manifest, source, manifestUrl, module, registry: scopedRegistry, record, context };
    loaded.set(manifest.id, handle);
    return handle;
  }

  async function loadFromUrl(manifestUrl) {
    const absoluteManifestUrl = new URL(manifestUrl, resolveBase()).href;
    const manifest = validatePluginForHost(JSON.parse(await fetchText(absoluteManifestUrl)));
    if (loaded.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already loaded`);
    }
    const entryUrl = new URL(manifest.entry, absoluteManifestUrl);
    entryUrl.searchParams.set('v', manifest.version);
    const module = await import(entryUrl.href);

    if (module.manifest) {
      const embedded = validatePluginForHost(module.manifest);
      if (embedded.id !== manifest.id || embedded.version !== manifest.version) {
        throw new Error(
          `Plugin manifest "${manifest.id}@${manifest.version}" does not match embedded "${embedded.id}@${embedded.version}"`,
        );
      }
    }

    return loadFromModule(module, { source: 'bundled', manifestUrl: absoluteManifestUrl });
  }

  async function loadBundled(indexUrl = 'plugins/index.json') {
    const absoluteIndexUrl = new URL(indexUrl, resolveBase()).href;
    const items = JSON.parse(await fetchText(absoluteIndexUrl));
    const errors = [];
    for (const item of items) {
      const manifestPath = typeof item === 'string' ? item : item.manifest;
      if (!manifestPath) continue;
      try {
        await loadFromUrl(new URL(manifestPath, absoluteIndexUrl).href);
      } catch (error) {
        if (!error.message.endsWith('is already loaded')) {
          errors.push(`${manifestPath}: ${error.message}`);
        }
      }
    }
    return errors;
  }

  async function loadFromFile(file) {
    const source = await file.text();
    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const module = await import(blobUrl);
      return await loadFromModule(module, { source: `file:${file.name}` });
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  function list() {
    return [...loaded.values()].map((handle) => ({
      id: handle.id,
      manifest: handle.manifest,
      source: handle.source,
      manifestUrl: handle.manifestUrl,
    }));
  }

  function has(id) {
    return loaded.has(id);
  }

  return { apiVersion, loadFromModule, loadFromUrl, loadBundled, loadFromFile, unload, list, has };
}
