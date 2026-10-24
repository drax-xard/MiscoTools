import { parseLpp, serializeLpp } from '../core/preset.js';
import { deleteSavedPreset, listSavedPresets, savePresetRecord } from './store.js';
import { $, clear, copyText, download, el, formatTime, readTextFile } from './dom.js';
import { summarizePreset } from './format.js';

export function createGalleryView(app) {
  const summary = $('#gallery-current-summary');
  const nameInput = $('#preset-name');
  const saveButton = $('#save-preset');
  const exportButton = $('#export-preset');
  const copyButton = $('#copy-preset');
  const openInput = $('#open-lpp');
  const savedList = $('#saved-presets');
  const bundledList = $('#bundled-presets');

  function suggestedName() {
    const names = app.getMixEntries().map((entry) => entry.lap.meta.name);
    if (names.length === 0) return 'Empty mix';
    if (names.length <= 3) return names.join(' + ');
    return `${names[0]} + ${names.length - 1} more`;
  }

  function currentPreset() {
    return app.currentPreset(nameInput.value.trim() || suggestedName());
  }

  function renderCurrent() {
    clear(summary);
    const entries = app.getMixEntries();
    if (entries.length === 0) {
      summary.append(el('p', { class: 'empty-note', text: 'No packs in the current mix.' }));
      return;
    }
    const rows = entries.map((entry) =>
      el(
        'div',
        { class: 'summary-row' },
        el('span', { text: entry.lap.meta.name }),
        el('span', { class: 'muted', text: `${Math.round(entry.weight * 100)}%` }),
      ),
    );
    summary.append(
      el('div', { class: 'summary-block' }, ...rows),
      el('p', { class: 'field-note', text: `Seed ${app.state.seed} · ${app.state.strategy} · ${app.state.renderer}` }),
    );
    if (!nameInput.value) nameInput.value = suggestedName();
  }

  function renderBundled() {
    clear(bundledList);
    if (!app.state.bundledPresets.length) {
      bundledList.append(el('p', { class: 'empty-note', text: 'No bundled presets found.' }));
      return;
    }
    for (const item of app.state.bundledPresets) {
      bundledList.append(
        el(
          'article',
          { class: 'preset-card' },
          el(
            'div',
            {},
            el('h3', { text: item.name }),
            el('p', { class: 'field-note', text: item.description ?? item.file }),
          ),
          el(
            'div',
            { class: 'card-actions' },
            el('button', {
              class: 'button subtle',
              type: 'button',
              text: 'Load',
              onclick: async () => {
                try {
                  const response = await fetch(`presets/${item.file}`);
                  if (!response.ok) throw new Error(`Could not load ${item.file}`);
                  const preset = parseLpp(await response.text());
                  app.applyPreset(preset);
                } catch (error) {
                  app.notify(error.message, 'error');
                }
              },
            }),
          ),
        ),
      );
    }
  }

  async function renderSaved() {
    clear(savedList);
    savedList.append(el('p', { class: 'empty-note', text: 'Loading saved presets…' }));
    let records = [];
    try {
      records = await listSavedPresets();
    } catch (error) {
      clear(savedList);
      savedList.append(el('p', { class: 'empty-note', text: `Could not read saved presets: ${error.message}` }));
      return;
    }
    clear(savedList);
    if (records.length === 0) {
      savedList.append(el('p', { class: 'empty-note', text: 'Nothing saved yet. Build a mix and save it here.' }));
      return;
    }
    for (const record of records) {
      const lapNames = record.preset.laps
        .map((entry) => app.state.packs.get(entry.id)?.meta.name ?? entry.id)
        .join(' + ');
      const availability = summarizePreset(record.preset, app.state.packs);
      const issues = [];
      if (availability.missing.length > 0) issues.push(`missing: ${availability.missing.join(', ')}`);
      for (const mismatch of availability.versionMismatches) {
        issues.push(`${mismatch.id} expects v${mismatch.expected}, loaded v${mismatch.actual}`);
      }
      savedList.append(
        el(
          'article',
          { class: 'preset-card' },
          el(
            'div',
            {},
            el('h3', { text: record.name }),
            el('p', { class: 'field-note', text: `${lapNames} · saved ${formatTime(record.savedAt)}` }),
            issues.length > 0 ? el('p', { class: 'preset-warning', text: issues.join(' · ') }) : null,
          ),
          el(
            'div',
            { class: 'card-actions' },
            el('button', {
              class: 'button subtle',
              type: 'button',
              text: 'Load',
              onclick: () => {
                try {
                  app.applyPreset(record.preset);
                } catch (error) {
                  app.notify(error.message, 'error');
                }
              },
            }),
            el('button', {
              class: 'button ghost',
              type: 'button',
              text: 'Export',
              onclick: () => download(`${record.name}.lpp`, serializeLpp(record.preset), 'application/json'),
            }),
            el('button', {
              class: 'button danger-ghost',
              type: 'button',
              text: 'Delete',
              onclick: async () => {
                if (!window.confirm(`Delete saved preset “${record.name}”?`)) return;
                await deleteSavedPreset(record.id);
                app.notify('Preset deleted.');
                renderSaved();
              },
            }),
          ),
        ),
      );
    }
  }

  function render() {
    renderCurrent();
    renderBundled();
    renderSaved();
  }

  function mount() {
    saveButton.addEventListener('click', async () => {
      try {
        const preset = currentPreset();
        serializeLpp(preset);
        await savePresetRecord(preset);
        app.notify(`Saved preset “${preset.name}”.`);
        renderSaved();
      } catch (error) {
        app.notify(error.message, 'error');
      }
    });

    exportButton.addEventListener('click', () => {
      try {
        const preset = currentPreset();
        download(`${preset.name}.lpp`, serializeLpp(preset), 'application/json');
        app.notify('Preset exported.');
      } catch (error) {
        app.notify(error.message, 'error');
      }
    });

    copyButton.addEventListener('click', async () => {
      try {
        const preset = currentPreset();
        await copyText(serializeLpp(preset));
        app.notify('Preset JSON copied.');
      } catch (error) {
        app.notify(error.message, 'error');
      }
    });

    openInput.addEventListener('change', async () => {
      const file = openInput.files?.[0];
      if (!file) return;
      try {
        const preset = parseLpp(await readTextFile(file));
        app.applyPreset(preset);
      } catch (error) {
        app.notify(error.message, 'error');
      } finally {
        openInput.value = '';
      }
    });
  }

  return { mount, render, renderCurrent, renderSaved };
}
