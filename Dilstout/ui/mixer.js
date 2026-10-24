import { registry } from '../core/registry.js';
import { createMixer } from '../core/mixer.js';
import { $, clear, el, humanize } from './dom.js';

const CATEGORIES = [
  { id: 'person', label: 'Person' },
  { id: 'place', label: 'Place' },
  { id: 'organization', label: 'Organization' },
  { id: 'domain', label: 'Domain' },
];

const PACK_COLORS = ['#f0b45e', '#7dd3c0', '#b9a0ff', '#ff8f7a', '#8fbcff', '#e3da75'];

export function createMixerView(app) {
  const list = $('#mix-list');
  const addSelect = $('#add-pack-select');
  const addButton = $('#add-pack');
  const openLapInput = $('#open-lap');
  const strategySelect = $('#strategy-select');
  const rendererSelect = $('#renderer-select');
  const seedInput = $('#seed-input');
  const seedButton = $('#random-seed');
  const summary = $('#mix-summary');

  function packColor(id) {
    const index = app.getMixEntries().findIndex((entry) => entry.id === id);
    return PACK_COLORS[Math.max(index, 0) % PACK_COLORS.length];
  }

  function renderPack(entry) {
    const { lap, id, weight, overrides } = entry;
    const weightOutput = el('output', { text: `${Math.round(weight * 100)}%` });

    const weightSlider = el('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      value: String(Math.round(weight * 100)),
      'aria-label': `Weight for ${lap.meta.name}`,
      oninput: (event) => {
        const next = Number(event.target.value);
        weightOutput.textContent = `${next}%`;
        app.setWeight(id, next / 100);
        updateSummary();
      },
    });

    const overrideRows = [];
    for (const category of CATEGORIES) {
      const multiplier = overrides?.[category.id] ?? 1;
      const output = el('output', { text: `${Math.round(multiplier * 100)}%` });
      overrideRows.push(
        el(
          'div',
          { class: 'override-row' },
          el('span', { text: category.label }),
          el('input', {
            type: 'range',
            min: '0',
            max: '200',
            step: '5',
            value: String(Math.round(multiplier * 100)),
            'aria-label': `${category.label} override for ${lap.meta.name}`,
            oninput: (event) => {
              const next = Number(event.target.value);
              output.textContent = `${next}%`;
              app.setOverride(id, category.id, next / 100);
              updateSummary();
            },
          }),
          output,
        ),
      );
    }

    return el(
      'article',
      { class: 'pack-card' },
      el(
        'div',
        { class: 'pack-head' },
        el(
          'div',
          { class: 'pack-title' },
          el('span', { class: 'pack-swatch', style: `background:${packColor(id)}` }),
          el(
            'div',
            {},
            el('h3', { text: lap.meta.name }),
            el('p', { class: 'pack-id', text: `${lap.meta.id}${lap.meta.culture ? ` · ${lap.meta.culture}` : ''}` }),
          ),
        ),
        el('button', {
          class: 'icon-button',
          type: 'button',
          title: `Remove ${lap.meta.name} from the mix`,
          'aria-label': `Remove ${lap.meta.name} from the mix`,
          onclick: () => {
            app.removeFromMix(id);
            render();
            updateSummary();
            app.notify(`${lap.meta.name} removed from the mix.`);
          },
          text: '×',
        }),
      ),
      el(
        'div',
        { class: 'pack-weight' },
        el('label', {}, el('span', { text: 'Weight' }), weightOutput),
        weightSlider,
      ),
      el(
        'details',
        { class: 'pack-more' },
        el('summary', { text: 'Per-category overrides' }),
        el('p', {
          class: 'field-note',
          text: 'Scale how strongly this pack contributes to each category. 100% is neutral.',
        }),
        el('div', { class: 'override-grid' }, ...overrideRows),
      ),
      el('div', { class: 'pack-tags' }, el('span', { class: 'chip', text: `${lap.meta.status ?? 'draft'}` })),
    );
  }

  function render() {
    clear(list);
    const entries = app.getMixEntries();
    if (entries.length === 0) {
      list.append(
        el('p', { class: 'empty-note', text: 'No packs in the mix yet. Add one below or open a .lap file.' }),
      );
    } else {
      list.append(...entries.map(renderPack));
    }

    clear(addSelect);
    const activeIds = new Set(entries.map((entry) => entry.id));
    const available = app.packsList().filter((lap) => !activeIds.has(lap.meta.id));
    if (available.length === 0) {
      addSelect.append(el('option', { value: '', text: 'All loaded packs are in the mix' }));
      addSelect.disabled = true;
      addButton.disabled = true;
    } else {
      addSelect.disabled = false;
      addButton.disabled = false;
      for (const lap of available) {
        addSelect.append(el('option', { value: lap.meta.id, text: lap.meta.name }));
      }
    }

    strategySelect.value = app.state.strategy;
    rendererSelect.value = app.state.renderer;
    seedInput.value = app.state.seed;
    updateSummary();
  }

  function updateSummary() {
    clear(summary);
    const entries = app.getMixEntries();
    if (entries.length === 0) {
      summary.append(el('p', { class: 'empty-note', text: 'Add at least one pack to see normalized shares.' }));
      return;
    }
    let mixer = null;
    try {
      mixer = createMixer(entries.map((entry) => ({ lap: entry.lap, weight: entry.weight, overrides: entry.overrides })));
    } catch (error) {
      summary.append(el('p', { class: 'empty-note', text: error.message }));
      return;
    }

    summary.append(el('p', { class: 'summary-title', text: 'Normalized share by category' }));
    for (const category of CATEGORIES) {
      let weights;
      try {
        weights = mixer.weightsFor(category.id);
      } catch {
        continue;
      }
      const parts = [];
      const labels = [];
      for (const entry of entries) {
        const share = weights.get(entry.id) ?? 0;
        if (share <= 0) continue;
        parts.push(
          el('span', {
            class: 'mix-segment',
            style: `width:${(share * 100).toFixed(2)}%;background:${packColor(entry.id)}`,
            title: `${entry.lap.meta.name}: ${Math.round(share * 100)}%`,
          }),
        );
        labels.push(`${entry.lap.meta.name} ${Math.round(share * 100)}%`);
      }
      summary.append(
        el(
          'div',
          { class: 'mix-row' },
          el('span', { class: 'mix-label', text: category.label }),
          el('div', {
            class: 'mix-bar',
            role: 'img',
            'aria-label': `${category.label}: ${labels.join(', ')}`,
          }, ...parts),
          el('span', { class: 'mix-values', text: labels.join(' · ') }),
        ),
      );
    }
  }

  function mount() {
    addButton.addEventListener('click', () => {
      if (!addSelect.value) return;
      app.addPackToMix(addSelect.value);
      render();
      updateSummary();
    });

    openLapInput.addEventListener('change', async () => {
      const file = openLapInput.files?.[0];
      if (!file) return;
      try {
        await app.openLapFile(file);
        render();
        updateSummary();
      } finally {
        openLapInput.value = '';
      }
    });

    clear(strategySelect);
    for (const strategy of registry.mixStrategies.list()) {
      strategySelect.append(
        el('option', {
          value: strategy.id,
          text: `${strategy.label ?? humanize(strategy.id)}${strategy.implemented === false ? ' (not implemented)' : ''}`,
          disabled: strategy.implemented === false,
        }),
      );
    }
    strategySelect.addEventListener('change', () => {
      app.setStrategy(strategySelect.value);
      app.notify(`Mixing strategy set to ${humanize(strategySelect.value)}.`);
    });

    clear(rendererSelect);
    for (const renderer of registry.renderers.list()) {
      rendererSelect.append(el('option', { value: renderer.id, text: renderer.label ?? humanize(renderer.id) }));
    }
    rendererSelect.addEventListener('change', () => {
      app.setRenderer(rendererSelect.value);
    });

    seedInput.addEventListener('change', () => app.setSeed(seedInput.value));
    seedButton.addEventListener('click', () => {
      app.randomizeSeed();
      seedInput.value = app.state.seed;
      app.notify('New seed generated.');
    });
  }

  return { mount, render, updateSummary, refresh: render };
}
