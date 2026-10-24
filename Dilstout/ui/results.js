import { resultsToCsv, resultsToText } from './format.js';
import { $, clear, copyText, download, el } from './dom.js';

export function createResultsView(app) {
  const categorySelect = $('#category-select');
  const countInput = $('#count-input');
  const generateButton = $('#generate');
  const toolbar = $('#result-toolbar');
  const meta = $('#result-meta');
  const list = $('#results');
  const copyAllButton = $('#copy-all');
  const exportTxtButton = $('#export-txt');
  const exportCsvButton = $('#export-csv');

  function lastRun() {
    return app.state.lastRun;
  }

  function updateToolbar() {
    const run = lastRun();
    if (!run || run.results.length === 0) {
      toolbar.hidden = true;
      return;
    }
    toolbar.hidden = false;
    clear(meta);
    meta.append(
      el('span', {
        text: `${run.results.length} ${run.results.length === 1 ? 'name' : 'names'} · ${run.category} · seed ${run.seed}`,
      }),
    );
    if (app.state.resultsStale) {
      meta.append(el('span', { class: 'stale-badge', text: 'Mix changed — generate again' }));
    }
    copyAllButton.disabled = false;
    exportTxtButton.disabled = false;
    exportCsvButton.disabled = false;
  }

  function renderResultCard(result) {
    const provenanceRows = result.provenance
      .filter((entry) => entry.slot || entry.value.trim().length > 0)
      .map((entry) =>
        el(
          'tr',
          {},
          el('td', { text: entry.slot ?? 'literal' }),
          el('td', {}, el('code', { text: entry.lapId })),
          el('td', { text: entry.value }),
          el('td', { class: 'muted', text: entry.gloss ?? '' }),
        ),
      );

    const details = el(
      'details',
      { class: 'result-details' },
      el('summary', { text: 'Provenance & phonemes' }),
      el('div', { class: 'phoneme-line' }, el('span', { class: 'muted', text: 'IPA ' }), el('code', { text: `/${result.phonemes.map((item) => item.symbol).join('')}/` })),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'provenance-table' },
          el(
            'thead',
            {},
            el('tr', {}, el('th', { text: 'Slot' }), el('th', { text: 'Source' }), el('th', { text: 'Value' }), el('th', { text: 'Gloss' })),
          ),
          el('tbody', {}, ...provenanceRows),
        ),
      ),
    );

    const warnings =
      result.warnings.length > 0
        ? el(
            'ul',
            { class: 'warnings' },
            ...result.warnings.map((warning) => el('li', { text: `${warning.code}: ${warning.message}` })),
          )
        : null;

    return el(
      'article',
      { class: 'result-card' },
      el(
        'div',
        { class: 'result-head' },
        el('h3', { text: result.name }),
        el(
          'div',
          { class: 'result-actions' },
          el('span', { class: 'chip', text: result.pool }),
          el('button', {
            class: 'icon-button',
            type: 'button',
            title: `Copy ${result.name}`,
            'aria-label': `Copy ${result.name}`,
            text: '⧉',
            onclick: async () => {
              await copyText(result.name);
              app.notify(`Copied “${result.name}”.`);
            },
          }),
        ),
      ),
      warnings,
      details,
    );
  }

  function render() {
    const run = lastRun();
    updateToolbar();
    clear(list);
    if (!run || run.results.length === 0) {
      list.append(
        el(
          'div',
          { class: 'empty-state' },
          el('span', { class: 'empty-mark', text: '✦' }),
          el('p', { text: 'Choose a category and press Generate.' }),
          el('p', { class: 'field-note', text: 'Names come from the packs in the mixer. Nothing leaves this page.' }),
        ),
      );
      return;
    }
    list.append(...run.results.map(renderResultCard));
  }

  function renderControls() {
    categorySelect.value = app.state.category;
    countInput.value = String(app.state.count);
  }

  function markStale() {
    if (lastRun()) {
      app.state.resultsStale = true;
      updateToolbar();
    }
  }

  function mount() {
    categorySelect.addEventListener('change', () => {
      app.setCategory(categorySelect.value);
      markStale();
    });
    countInput.addEventListener('change', () => {
      const value = Number(countInput.value);
      app.setCount(value);
      countInput.value = String(app.state.count);
    });
    generateButton.addEventListener('click', () => app.generate());

    copyAllButton.addEventListener('click', async () => {
      const run = lastRun();
      if (!run) return;
      await copyText(resultsToText(run.results));
      app.notify(`Copied ${run.results.length} names.`);
    });
    exportTxtButton.addEventListener('click', () => {
      const run = lastRun();
      if (!run) return;
      download(`dilstout-${run.category}-${run.seed}.txt`, `${resultsToText(run.results)}\n`, 'text/plain');
    });
    exportCsvButton.addEventListener('click', () => {
      const run = lastRun();
      if (!run) return;
      download(`dilstout-${run.category}-${run.seed}.csv`, `${resultsToCsv(run.results)}\n`, 'text/csv');
    });
  }

  return { mount, render, renderControls, markStale };
}
