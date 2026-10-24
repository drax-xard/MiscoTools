export function createRegistry(name) {
  const entries = new Map();

  return {
    name,
    register(id, value, meta = {}) {
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`${name}: extension id must be a non-empty string`);
      }
      if (entries.has(id)) {
        throw new Error(`${name}: duplicate extension id "${id}"`);
      }
      const record = { id, value, meta: { ...meta } };
      entries.set(id, record);
      return value;
    },
    unregister(id) {
      return entries.delete(id);
    },
    has(id) {
      return entries.has(id);
    },
    get(id) {
      const record = entries.get(id);
      if (!record) throw new Error(`${name}: unknown extension "${id}"`);
      return record.value;
    },
    getRecord(id) {
      return entries.get(id) ?? null;
    },
    list() {
      return [...entries.values()].map((record) => ({
        id: record.id,
        ...record.meta,
      }));
    },
    ids() {
      return [...entries.keys()];
    },
    clear() {
      entries.clear();
    },
  };
}

export const registry = {
  mixStrategies: createRegistry('mixStrategies'),
  renderers: createRegistry('renderers'),
  speakers: createRegistry('speakers'),
  prosody: createRegistry('prosody'),
  slotResolvers: createRegistry('slotResolvers'),
  phonemeResolvers: createRegistry('phonemeResolvers'),
  categories: createRegistry('categories'),
  importers: createRegistry('importers'),
  exporters: createRegistry('exporters'),
  validators: createRegistry('validators'),
  uiPanels: createRegistry('uiPanels'),
};
