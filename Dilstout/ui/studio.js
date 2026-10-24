import { lapSchema, validateLap } from '../core/schema.js';
import { registry } from '../core/registry.js';
import { loadLap } from '../core/lap.js';
import { generate } from '../core/engine.js';
import { IMPORT_TARGETS, importIntoDraft } from './format.js';
import { $, clear, debounce, download, el, humanize, readTextFile } from './dom.js';

const SECTION_ORDER = ['meta', 'phonology', 'lexicon', 'person', 'place', 'organization', 'domain', 'weights', 'voice'];
const SECTION_LABELS = {
  meta: 'Identity',
  phonology: 'Phonology',
  lexicon: 'Lexicon',
  person: 'Person names',
  place: 'Places',
  organization: 'Organizations',
  domain: 'Domains',
  weights: 'Weights',
  voice: 'Voice',
};
const FIELD_LABELS = {
  id: 'Pack ID',
  name: 'Display name',
  culture: 'Culture',
  era: 'Era',
  author: 'Author',
  license: 'License',
  sources: 'Sources',
  notes: 'Notes',
  status: 'Status',
  inventory: 'Phoneme inventory',
  romanization: 'Romanization (grapheme: IPA)',
  phonotactics: 'Phonotactics',
  prosody: 'Prosody',
  joinRules: 'Join rules',
  roots: 'Roots (root: gloss, gloss)',
  prefixes: 'Prefixes',
  suffixes: 'Suffixes',
  epithets: 'Epithets',
  honorifics: 'Honorifics',
  numerals: 'Numerals',
  articles: 'Articles',
  given: 'Given names',
  male: 'Male',
  female: 'Female',
  neutral: 'Neutral',
  templates: 'Templates',
  surnamePatterns: 'Surname patterns',
  order: 'Name order',
  clan: 'Clans or lineages',
  patronymic: 'Patronymic pattern',
  gendered: 'Gendered names',
  settlementTypes: 'Settlement types',
  settlementSuffixes: 'Settlement suffixes',
  terrainMorphemes: 'Terrain morphemes',
  directionalAffixes: 'Directional affixes',
  religious: 'Religious',
  political: 'Political',
  military: 'Military',
  guild: 'Guild',
  nation: 'Nation',
  kingdom: 'Kingdom',
  empire: 'Empire',
  province: 'Province',
  district: 'District',
  town: 'Town',
  componentWeights: 'Component weights',
  categoryBias: 'Category bias',
  preferredSpeaker: 'Preferred speaker',
  basePitch: 'Base pitch (Hz)',
  rate: 'Rate',
};
const PLACEHOLDERS = {
  sources: 'One citation per line',
  roots: 'bab: gate\nnur: light',
  romanization: 'sh: ʃ\na: a',
  templates: 'One template per line, e.g. {root}{settlementSuffix}',
  male: 'One name per line',
  female: 'One name per line',
  neutral: 'One name per line',
  clan: 'One name per line',
  notes: 'Scope, dialect, transliteration choices, caveats',
};
const HIDDEN_FIELDS = new Set(['format', 'version']);
const ADD_LABELS = { inventory: 'Add phoneme', joinRules: 'Add join rule' };

let fieldCounter = 0;

function clone(value) {
  return structuredClone(value);
}

function getPath(object, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);
}

function setPath(object, path, value) {
  const keys = path.split('.');
  let node = object;
  for (const key of keys.slice(0, -1)) {
    if (node[key] === undefined || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[keys.at(-1)] = value;
}

function resolveSchema(schema, root = lapSchema) {
  if (!schema?.$ref) return schema;
  return schema.$ref
    .slice(2)
    .split('/')
    .reduce((node, key) => node?.[key], root);
}

function isNullable(schema) {
  return Array.isArray(schema.type) && schema.type.includes('null');
}

function labelFor(key, schema) {
  const title = FIELD_LABELS[key] ?? humanize(key);
  const hint = schema.description ? ` — ${schema.description}` : '';
  return `${title}${hint}`;
}

function blankLap() {
  return {
    format: 'dilstout.lap',
    version: 1,
    meta: {
      id: 'my-pack',
      name: 'My pack',
      culture: '',
      era: '',
      author: '',
      license: '',
      sources: [],
      notes: '',
      status: 'experimental',
    },
    phonology: {
      inventory: [
        { symbol: 'a', type: 'vowel', height: 'open', backness: 'central', rounded: false, length: 'short' },
        { symbol: 'e', type: 'vowel', height: 'mid', backness: 'front', rounded: false, length: 'short' },
        { symbol: 'i', type: 'vowel', height: 'close', backness: 'front', rounded: false, length: 'short' },
        { symbol: 'o', type: 'vowel', height: 'mid', backness: 'back', rounded: true, length: 'short' },
        { symbol: 'k', type: 'consonant', place: 'velar', manner: 'stop', voicing: 'voiceless' },
        { symbol: 't', type: 'consonant', place: 'alveolar', manner: 'stop', voicing: 'voiceless' },
        { symbol: 'n', type: 'consonant', place: 'alveolar', manner: 'nasal', voicing: 'voiced' },
        { symbol: 'm', type: 'consonant', place: 'bilabial', manner: 'nasal', voicing: 'voiced' },
        { symbol: 'r', type: 'consonant', place: 'alveolar', manner: 'trill', voicing: 'voiced' },
        { symbol: 's', type: 'consonant', place: 'alveolar', manner: 'fricative', voicing: 'voiceless' },
      ],
      romanization: { a: 'a', e: 'e', i: 'i', o: 'o', k: 'k', t: 't', n: 'n', m: 'm', r: 'r', s: 's' },
      phonotactics: { onsets: ['k', 't', 'n', 'm', 'r', 's'], nuclei: ['a', 'e', 'i', 'o'], codas: ['n'], notes: '' },
      prosody: {
        stress: 'penultimate',
        syllableTemplate: 'CV(C)',
        tempo: 1,
        vowelLengthDistinctive: false,
        tone: null,
      },
      joinRules: [],
    },
    lexicon: {
      roots: { aka: ['water'], nemi: ['life'], sira: ['star'], toma: ['dawn'] },
      prefixes: [],
      suffixes: [],
      epithets: [],
      honorifics: [],
      numerals: [],
      articles: [],
    },
    person: {
      given: { male: [], female: [], neutral: ['aka', 'nemi', 'sira', 'toma', 'kora', 'tisa'] },
      templates: ['{given}'],
      surnamePatterns: [],
      order: 'given-family',
      clan: [],
      patronymic: null,
      gendered: true,
    },
    place: {
      templates: ['{root}{settlementSuffix}'],
      settlementTypes: [],
      settlementSuffixes: ['ton'],
      terrainMorphemes: [],
      directionalAffixes: [],
    },
    organization: { religious: [], political: [], military: [], guild: [] },
    domain: { nation: [], kingdom: [], empire: [], province: [], district: [], town: [] },
    weights: { componentWeights: {}, categoryBias: {} },
    voice: { preferredSpeaker: 'formant', basePitch: 110, rate: 1 },
  };
}

export function createStudioView(app) {
  const form = $('#studio-form');
  const validation = $('#studio-validation');
  const preview = $('#studio-preview');
  const previewCategory = $('#studio-category');
  const startSelect = $('#studio-start');
  const openInput = $('#studio-open-lap');
  const validateButton = $('#studio-validate');
  const exportButton = $('#studio-export');
  const addMixButton = $('#studio-add-mix');
  const importToggle = $('#studio-import-toggle');
  const importPanel = $('#studio-import-panel');
  const importTarget = $('#studio-import-target');
  const importFile = $('#studio-import-file');
  const importText = $('#studio-import-text');
  const importAppend = $('#studio-import-append');
  const importStatus = $('#studio-import-status');

  let draft = blankLap();

  function schedulePreview() {
    debouncePreview();
  }

  function updateDraft(path, value) {
    setPath(draft, path, value);
    schedulePreview();
  }

  function textAreaField(schema, value, path, key) {
    const id = `studio-field-${(fieldCounter += 1)}`;
    const rows = key === 'sources' ? 4 : key === 'notes' ? 4 : Math.min(10, Math.max(3, (value?.length ?? 0) + 1));
    const control = el('textarea', {
      id,
      rows: String(rows),
      spellcheck: 'false',
      placeholder: PLACEHOLDERS[key] ?? '',
      oninput: (event) => {
        const lines = event.target.value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        updateDraft(path, lines);
      },
    });
    control.value = Array.isArray(value) ? value.join('\n') : '';
    return el('div', { class: 'field field-wide' }, el('label', { for: id, text: labelFor(key, schema) }), control);
  }

  function scalarField(schema, value, path, key) {
    const id = `studio-field-${(fieldCounter += 1)}`;
    const nullable = isNullable(schema);
    let control;
    let wrapperChildren;

    if (schema.enum) {
      control = el('select', {
        id,
        onchange: (event) => {
          const next = event.target.value;
          updateDraft(path, next === '' && nullable ? null : next);
        },
      });
      if (nullable) control.append(el('option', { value: '', text: '— none —' }));
      for (const option of schema.enum) {
        control.append(el('option', { value: option, text: humanize(option) }));
      }
      control.value = value === null || value === undefined ? '' : value;
    } else if (schema.type === 'boolean') {
      control = el('input', {
        id,
        type: 'checkbox',
        checked: Boolean(value),
        onchange: (event) => updateDraft(path, event.target.checked),
      });
      wrapperChildren = [el('label', { class: 'checkbox-row', for: id }, control, el('span', { text: labelFor(key, schema) }))];
    } else if (schema.type === 'number' || schema.type === 'integer') {
      control = el('input', {
        id,
        type: 'number',
        step: schema.type === 'integer' ? '1' : 'any',
        min: schema.minimum !== undefined ? String(schema.minimum) : undefined,
        max: schema.maximum !== undefined ? String(schema.maximum) : undefined,
        oninput: (event) => {
          const next = event.target.value === '' ? 0 : Number(event.target.value);
          updateDraft(path, schema.type === 'integer' ? Math.round(next) : next);
        },
      });
      control.value = value === null || value === undefined ? '0' : String(value);
    } else {
      control = el('input', {
        id,
        type: 'text',
        spellcheck: 'false',
        oninput: (event) => {
          const next = event.target.value;
          updateDraft(path, nullable && next === '' ? null : next);
        },
      });
      control.value = value === null || value === undefined ? '' : String(value);
    }

    if (wrapperChildren) return el('div', { class: 'field' }, ...wrapperChildren);
    return el(
      'div',
      { class: 'field' },
      el('label', { for: id, text: labelFor(key, schema) }),
      control,
    );
  }

  function mapField(schema, value, path, key) {
    const id = `studio-field-${(fieldCounter += 1)}`;
    const valueSchema = resolveSchema(schema.additionalProperties);
    const current = value ?? {};
    let text;
    if (valueSchema?.type === 'array') {
      text = Object.entries(current)
        .map(([entryKey, glosses]) => `${entryKey}: ${Array.isArray(glosses) ? glosses.join(', ') : ''}`)
        .join('\n');
    } else {
      text = Object.entries(current)
        .map(([entryKey, entryValue]) => `${entryKey}: ${entryValue}`)
        .join('\n');
    }
    const control = el('textarea', {
      id,
      rows: String(Math.min(12, Math.max(4, Object.keys(current).length + 2))),
      spellcheck: 'false',
      placeholder: PLACEHOLDERS[key] ?? 'key: value',
      oninput: (event) => {
        const next = {};
        for (const line of event.target.value.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const separator = trimmed.indexOf(':');
          const entryKey = (separator === -1 ? trimmed : trimmed.slice(0, separator)).trim();
          const rest = separator === -1 ? '' : trimmed.slice(separator + 1).trim();
          if (!entryKey) continue;
          if (valueSchema?.type === 'array') {
            next[entryKey] = rest
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean);
          } else if (valueSchema?.type === 'number') {
            const number = Number(rest);
            if (Number.isFinite(number)) next[entryKey] = number;
          } else {
            next[entryKey] = rest;
          }
        }
        updateDraft(path, next);
      },
    });
    control.value = text;
    return el(
      'div',
      { class: 'field field-wide' },
      el('label', { for: id, text: labelFor(key, schema) }),
      control,
    );
  }

  function objectFields(schema, value, path, depth = 0) {
    const container = el('div', { class: depth === 0 ? 'field-stack' : 'subfields' });
    for (const [key, childSchemaRaw] of Object.entries(schema.properties ?? {})) {
      if (HIDDEN_FIELDS.has(key)) continue;
      const childSchema = resolveSchema(childSchemaRaw);
      const childValue = value?.[key];
      container.append(renderField(childSchema, childValue, `${path}.${key}`, key, depth));
    }
    return container;
  }

  function repeatableField(schema, value, path, key) {
    const itemSchema = resolveSchema(schema.items);
    const items = Array.isArray(value) ? value : [];
    const wrapper = el('div', { class: 'field field-wide' });
    wrapper.append(el('span', { class: 'field-label', text: labelFor(key, schema) }));
    if (items.length === 0) {
      wrapper.append(el('p', { class: 'empty-note', text: 'No entries yet.' }));
    }
    items.forEach((item, index) => {
      const row = el(
        'div',
        { class: 'repeat-row' },
        el(
          'div',
          { class: 'repeat-head' },
          el('span', { text: `${humanize(key).replace(/s$/, '')} ${index + 1}` }),
          el('button', {
            class: 'icon-button',
            type: 'button',
            title: 'Remove entry',
            'aria-label': 'Remove entry',
            text: '×',
            onclick: () => {
              items.splice(index, 1);
              renderForm();
              schedulePreview();
            },
          }),
        ),
      );
      row.append(objectFields(itemSchema, item, `${path}.${index}`, 1));
      wrapper.append(row);
    });
    wrapper.append(
      el('button', {
        class: 'button subtle',
        type: 'button',
        text: ADD_LABELS[key] ?? `Add ${humanize(key).replace(/s$/, '').toLowerCase()}`,
        onclick: () => {
          const item = defaultForSchema(itemSchema);
          items.push(item);
          setPath(draft, path, items);
          renderForm();
          schedulePreview();
        },
      }),
    );
    return wrapper;
  }

  function arrayField(schema, value, path, key) {
    const itemSchema = resolveSchema(schema.items);
    if (itemSchema?.type === 'object') return repeatableField(schema, value, path, key);
    if (itemSchema?.type === 'string' || itemSchema?.enum) return textAreaField(schema, value, path, key);
    return textAreaField(schema, value, path, key);
  }

  function renderField(schema, value, path, key, depth = 0) {
    if (!schema) return el('div');
    if (schema.type === 'object') {
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        return mapField(schema, value, path, key);
      }
      const group = el(
        'div',
        { class: depth === 0 ? 'field field-wide' : 'field-group' },
        el('span', { class: 'field-label', text: labelFor(key, schema) }),
        objectFields(schema, value ?? {}, path, depth + 1),
      );
      return group;
    }
    if (schema.type === 'array') return arrayField(schema, value, path, key);
    return scalarField(schema, value, path, key);
  }

  function defaultForSchema(schema) {
    if (!schema) return null;
    if (schema.type === 'object') {
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') return {};
      const object = {};
      for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
        object[key] = defaultForSchema(resolveSchema(childSchema));
      }
      return object;
    }
    if (schema.type === 'array') return [];
    if (schema.enum) return schema.enum[0];
    if (schema.type === 'boolean') return false;
    if (schema.type === 'number' || schema.type === 'integer') return 0;
    if (isNullable(schema)) return null;
    return '';
  }

  function renderForm() {
    const openSections = new Set(
      [...form.querySelectorAll('details[data-section][open]')].map((node) => node.dataset.section),
    );
    fieldCounter = 0;
    clear(form);
    for (const section of SECTION_ORDER) {
      const schema = lapSchema.properties[section];
      if (!schema) continue;
      if (!draft[section] || typeof draft[section] !== 'object') draft[section] = {};
      const open = openSections.size > 0 ? openSections.has(section) : section === 'meta';
      const details = el(
        'details',
        { class: 'studio-section', open, 'data-section': section },
        el('summary', {}, el('span', { text: SECTION_LABELS[section] ?? humanize(section) }), el('span', { class: 'section-hint', text: section })),
      );
      details.append(objectFields(schema, draft[section], section));
      form.append(details);
    }
  }

  function renderValidation(errors) {
    clear(validation);
    if (errors.length === 0) {
      validation.append(el('p', { class: 'valid-message', text: 'Pack is valid.' }));
      return;
    }
    validation.append(el('p', { class: 'invalid-message', text: `${errors.length} validation ${errors.length === 1 ? 'issue' : 'issues'}` }));
    validation.append(el('ul', { class: 'validation-list' }, ...errors.slice(0, 30).map((error) => el('li', { text: error }))));
    if (errors.length > 30) validation.append(el('p', { class: 'field-note', text: `…and ${errors.length - 30} more.` }));
  }

  function runPreview() {
    const errors = validateLap(draft);
    renderValidation(errors);
    clear(preview);
    if (errors.length > 0) {
      preview.append(el('p', { class: 'empty-note', text: 'Fix the validation issues to see a live preview.' }));
      return;
    }
    try {
      const lap = loadLap(draft);
      const results = generate({
        laps: [lap],
        category: previewCategory.value,
        count: 6,
        seed: 'dilstout-studio',
      });
      preview.append(
        el('ul', { class: 'preview-list' }, ...results.map((result) => el('li', { text: result.name }))),
        el('p', { class: 'field-note', text: `Previewed from ${lap.meta.name} only.` }),
      );
    } catch (error) {
      preview.append(el('p', { class: 'invalid-message', text: error.message }));
    }
  }

  const debouncePreview = debounce(runPreview, 300);

  function refreshCategories() {
    const current = previewCategory.value || 'person';
    clear(previewCategory);
    for (const meta of registry.categories.list()) {
      previewCategory.append(el('option', { value: meta.id, text: meta.label ?? meta.id }));
    }
    previewCategory.value = registry.categories.has(current) ? current : 'person';
  }

  function rebuildSources() {
    const previous = startSelect.value;
    clear(startSelect);
    startSelect.append(el('option', { value: 'blank', text: 'Blank starter pack' }));
    for (const lap of app.packsList()) {
      startSelect.append(el('option', { value: lap.meta.id, text: `${lap.meta.name} (bundled or loaded)` }));
    }
    startSelect.value = previous || 'blank';
  }

  function startFrom(value) {
    if (value === 'blank') {
      draft = blankLap();
    } else {
      const lap = app.state.packs.get(value);
      if (!lap) {
        app.notify(`Pack “${value}” is not loaded.`, 'error');
        return;
      }
      draft = clone(lap);
    }
    renderForm();
    runPreview();
  }

  function openLap(lap) {
    draft = clone(lap);
    renderForm();
    runPreview();
  }

  function mount() {
    refreshCategories();
    rebuildSources();
    renderForm();

    startSelect.addEventListener('change', () => startFrom(startSelect.value));

    openInput.addEventListener('change', async () => {
      const file = openInput.files?.[0];
      if (!file) return;
      try {
        const lap = loadLap(await readTextFile(file));
        openLap(lap);
        app.notify(`Loaded ${lap.meta.name} into the studio.`);
      } catch (error) {
        app.notify(error.message, 'error');
      } finally {
        openInput.value = '';
      }
    });

    previewCategory.addEventListener('change', runPreview);
    validateButton.addEventListener('click', runPreview);

    exportButton.addEventListener('click', () => {
      const errors = validateLap(draft);
      if (errors.length > 0) {
        app.notify(`Fix ${errors.length} validation issue(s) before exporting.`, 'error');
        return;
      }
      try {
        const lap = loadLap(draft);
        download(`${lap.meta.id}.lap`, `${JSON.stringify(lap, null, 2)}\n`, 'application/json');
        app.notify(`Exported ${lap.meta.id}.lap.`);
      } catch (error) {
        app.notify(error.message, 'error');
      }
    });

    addMixButton.addEventListener('click', () => {
      try {
        const lap = loadLap(draft);
        app.addPack(lap);
        app.setTab('workspace');
        app.notify(`${lap.meta.name} added to the mixer.`);
      } catch (error) {
        app.notify(error.message, 'error');
      }
    });

    importToggle.addEventListener('click', () => {
      importPanel.hidden = !importPanel.hidden;
      if (!importPanel.hidden) importText.focus();
    });

    clear(importTarget);
    for (const target of IMPORT_TARGETS) {
      importTarget.append(el('option', { value: target.id, text: target.label }));
    }

    importFile.addEventListener('change', async () => {
      const file = importFile.files?.[0];
      if (!file) return;
      try {
        importText.value = await readTextFile(file);
        clear(importStatus);
        importStatus.append(el('span', { text: `Loaded ${file.name}.` }));
      } catch (error) {
        app.notify(error.message, 'error');
      } finally {
        importFile.value = '';
      }
    });

    importAppend.addEventListener('click', () => {
      try {
        const result = importIntoDraft(draft, importTarget.value, importText.value);
        clear(importStatus);
        importStatus.append(el('span', { text: `Added ${result.added} entr${result.added === 1 ? 'y' : 'ies'}.` }));
        renderForm();
        schedulePreview();
        if (result.added === 0) app.notify('No new entries were added.');
      } catch (error) {
        app.notify(error.message, 'error');
      }
    });

    runPreview();
  }

  return {
    mount,
    refreshSources: rebuildSources,
    refreshCategories,
    open: openLap,
  };
}
