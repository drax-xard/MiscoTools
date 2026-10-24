import {
  createPreset,
  generate,
  loadLap,
  registry,
  seedToCode,
} from '../core/index.js';
import { createMixerView } from './mixer.js';
import { createResultsView } from './results.js';
import { createGalleryView } from './gallery.js';
import { createStudioView } from './studio.js';
import { summarizePreset } from './format.js';
import { $, $$, readTextFile } from './dom.js';

const MIN_COUNT = 1;
const MAX_COUNT = 200;

function makeSeed() {
  try {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return seedToCode(buffer[0]);
  } catch {
    return seedToCode(Date.now() >>> 0);
  }
}

function clampCount(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 10;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, number));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.text();
}

const state = {
  packs: new Map(),
  mix: [],
  seed: makeSeed(),
  strategy: 'weighted-lottery',
  renderer: 'plain',
  category: 'person',
  count: 10,
  lastRun: null,
  resultsStale: false,
  bundledPresets: [],
  activeTab: 'workspace',
};

let toastTimer = null;
let views = null;

function showBanner(message) {
  const banner = $('#banner');
  banner.hidden = false;
  banner.textContent = message;
}

function notify(message, tone = 'info') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast is-visible tone-${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 4200);
}

const app = {
  state,
  notify,

  packsList() {
    return [...state.packs.values()].sort((a, b) => a.meta.name.localeCompare(b.meta.name));
  },

  getMixEntries() {
    return state.mix
      .map((entry) => ({ ...entry, lap: state.packs.get(entry.id) }))
      .filter((entry) => Boolean(entry.lap));
  },

  getMixLaps() {
    return app.getMixEntries().map((entry) => entry.lap);
  },

  addPackToMix(id) {
    const lap = state.packs.get(id);
    if (!lap) {
      notify(`Pack “${id}” is not loaded.`, 'error');
      return;
    }
    if (state.mix.some((entry) => entry.id === id)) return;
    state.mix.push({ id, weight: 0.5, overrides: {} });
    app.refresh();
    notify(`${lap.meta.name} added to the mix.`);
  },

  addPack(lap) {
    const existed = state.packs.has(lap.meta.id);
    state.packs.set(lap.meta.id, lap);
    if (!state.mix.some((entry) => entry.id === lap.meta.id)) {
      state.mix.push({ id: lap.meta.id, weight: 0.5, overrides: {} });
    }
    app.refresh();
    if (!existed) notify(`${lap.meta.name} is now available in the mixer.`);
  },

  removeFromMix(id) {
    state.mix = state.mix.filter((entry) => entry.id !== id);
    app.refresh();
  },

  setWeight(id, weight) {
    const entry = state.mix.find((item) => item.id === id);
    if (!entry) return;
    entry.weight = Math.min(1, Math.max(0, Number(weight)));
    results.markStale();
  },

  setOverride(id, category, value) {
    const entry = state.mix.find((item) => item.id === id);
    if (!entry) return;
    entry.overrides[category] = Math.min(2, Math.max(0, Number(value)));
    results.markStale();
  },

  setStrategy(id) {
    state.strategy = id;
    results.markStale();
  },

  setRenderer(id) {
    state.renderer = id;
    results.markStale();
  },

  setSeed(value) {
    state.seed = String(value).trim() || makeSeed();
    results.markStale();
  },

  randomizeSeed() {
    state.seed = makeSeed();
    results.markStale();
  },

  setCategory(category) {
    state.category = category;
  },

  setCount(value) {
    state.count = clampCount(value);
  },

  currentPreset(name = 'Session mix') {
    const entries = app.getMixEntries();
    if (entries.length === 0) throw new Error('Add at least one language pack to the mix.');
    return createPreset({
      name,
      laps: entries.map((entry) => ({ id: entry.id, weight: entry.weight, overrides: entry.overrides })),
      seed: state.seed,
      strategy: state.strategy,
      renderer: state.renderer,
      pins: Object.fromEntries(entries.map((entry) => [entry.id, entry.lap.version])),
    });
  },

  generate() {
    try {
      const entries = app.getMixEntries();
      if (entries.length === 0) throw new Error('Add at least one language pack to the mix.');
      const preset = app.currentPreset();
      const resultsList = generate({
        laps: entries.map((entry) => entry.lap),
        preset,
        category: state.category,
        count: state.count,
        seed: state.seed,
      });
      state.lastRun = {
        results: resultsList,
        category: state.category,
        seed: state.seed,
        count: state.count,
      };
      state.resultsStale = false;
      results.render();
      results.renderControls();
    } catch (error) {
      notify(error.message, 'error');
    }
  },

  applyPreset(preset) {
    const { available, missing, versionMismatches } = summarizePreset(preset, state.packs);
    if (available.length === 0) {
      throw new Error(`None of this preset's packs are loaded: ${preset.laps.map((entry) => entry.id).join(', ')}`);
    }

    const warnings = [];
    if (missing.length > 0) warnings.push(`missing pack(s): ${missing.join(', ')}`);
    for (const mismatch of versionMismatches) {
      warnings.push(`${mismatch.id} is version ${mismatch.actual}, preset expects ${mismatch.expected}`);
    }

    state.mix = available.map((entry) => ({
      id: entry.id,
      weight: entry.weight,
      overrides: entry.overrides ?? {},
    }));
    state.seed = preset.seed;

    const strategy = registry.mixStrategies.getRecord(preset.strategy);
    if (strategy && strategy.meta.implemented !== false) {
      state.strategy = preset.strategy;
    } else {
      state.strategy = 'weighted-lottery';
      warnings.push(`strategy "${preset.strategy}" is unavailable; using weighted-lottery`);
    }

    if (registry.renderers.has(preset.renderer)) state.renderer = preset.renderer;
    else {
      state.renderer = 'plain';
      warnings.push(`renderer "${preset.renderer}" is unavailable; using plain`);
    }

    state.resultsStale = Boolean(state.lastRun);
    app.refresh();
    app.setTab('workspace');
    if (warnings.length > 0) {
      notify(`Loaded “${preset.name}” with warnings: ${warnings.join('; ')}`, 'warning');
    } else {
      notify(`Loaded preset “${preset.name}”.`);
    }
  },

  async loadLapFile(file) {
    try {
      const lap = loadLap(await readTextFile(file));
      app.addPack(lap);
      notify(`Loaded ${lap.meta.name} from ${file.name}.`);
      return lap;
    } catch (error) {
      notify(error.message, 'error');
      throw error;
    }
  },

  setTab(name) {
    state.activeTab = name;
    for (const button of $$('[data-tab]')) {
      const active = button.dataset.tab === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (const panel of $$('.tab-panel')) {
      panel.hidden = panel.id !== `panel-${name}`;
    }
    if (name === 'gallery') gallery.render();
    if (name === 'studio') studio.refreshSources();
  },

  refresh() {
    if (!views) return;
    mixer.render();
    results.renderControls();
    results.markStale();
    gallery.renderCurrent();
    studio.refreshSources();
  },

  async init() {
    const failures = [];
    let packIndex = [];
    let presetIndex = [];

    try {
      packIndex = await fetchJson('packs/index.json');
    } catch (error) {
      failures.push(`pack index: ${error.message}`);
    }

    try {
      presetIndex = await fetchJson('presets/index.json');
    } catch (error) {
      failures.push(`preset index: ${error.message}`);
    }

    for (const item of packIndex) {
      try {
        const lap = loadLap(await fetchText(`packs/${item.file}`));
        state.packs.set(lap.meta.id, lap);
      } catch (error) {
        failures.push(`${item.id ?? item.file}: ${error.message}`);
      }
    }

    state.bundledPresets = presetIndex;
    const preferred = ['ancient-babylonian', 'aztec'].filter((id) => state.packs.has(id));
    const chosen = preferred.length > 0 ? preferred : [...state.packs.keys()].slice(0, 2);
    state.mix = chosen.map((id) => ({ id, weight: 0.5, overrides: {} }));
    state.seed = makeSeed();

    if (failures.length > 0) {
      showBanner(
        `Some bundled files did not load (${failures.join('; ')}). Serve this folder over HTTP, for example: python3 -m http.server 8000`,
      );
    }

    views = {
      mixer: createMixerView(app),
      results: createResultsView(app),
      gallery: createGalleryView(app),
      studio: createStudioView(app),
    };
    const { mixer, results, gallery, studio } = views;

    mixer.mount();
    results.mount();
    gallery.mount();
    studio.mount();

    mixer.render();
    results.renderControls();
    results.render();
    gallery.render();

    for (const button of $$('[data-tab]')) {
      button.addEventListener('click', () => app.setTab(button.dataset.tab));
    }
    app.setTab('workspace');

    if (state.packs.size === 0) {
      showBanner(
        'No language packs loaded. Serve this folder over HTTP, or open a .lap file in the mixer, then reload.',
      );
    }
  },
};

const mixer = {
  render: () => views?.mixer.render(),
  updateSummary: () => views?.mixer.updateSummary(),
};

const results = {
  render: () => views?.results.render(),
  renderControls: () => views?.results.renderControls(),
  markStale: () => views?.results.markStale(),
};

const gallery = {
  render: () => views?.gallery.render(),
  renderCurrent: () => views?.gallery.renderCurrent(),
};

const studio = {
  refreshSources: () => views?.studio.refreshSources(),
};

app.init().catch((error) => {
  showBanner(`Dilstout failed to start: ${error.message}`);
  console.error(error);
});
