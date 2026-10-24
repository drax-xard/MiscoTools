import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importIntoDraft,
  resultsToCsv,
  resultsToText,
  summarizePreset,
} from '../ui/format.js';

const sampleResults = [
  {
    name: 'Shamash-iddin',
    category: 'person',
    pool: 'person',
    seed: 'dilstout-7f3a',
    warnings: [{ code: 'duplicate', message: 'Duplicate name' }],
    phonemes: [{ symbol: 'ʃ' }, { symbol: 'a' }],
    provenance: [{ slot: 'root', lapId: 'ancient-babylonian', value: 'shamash' }],
  },
  {
    name: 'Xochitl',
    category: 'person',
    pool: 'person',
    seed: 'dilstout-7f3a',
    warnings: [],
    phonemes: [{ symbol: 'ʃ' }, { symbol: 'o' }],
    provenance: [{ slot: 'given', lapId: 'aztec', value: 'xochitl' }],
  },
];

function draft() {
  return {
    person: {
      given: { male: [], female: [], neutral: [] },
      templates: [],
      surnamePatterns: [],
      clan: [],
    },
    lexicon: { roots: {}, prefixes: [], suffixes: [], honorifics: [], epithets: [] },
    place: { templates: [] },
    organization: { religious: [], political: [], military: [], guild: [] },
    domain: { nation: [], kingdom: [], empire: [], province: [], district: [], town: [] },
  };
}

test('results export as plain text', () => {
  assert.equal(resultsToText(sampleResults), 'Shamash-iddin\nXochitl');
});

test('results CSV escapes quotes, commas, and newlines', () => {
  const csv = resultsToCsv(sampleResults);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'name,category,pool,seed,warnings,phonemes,provenance');
  assert.match(lines[1], /^Shamash-iddin,person,person,dilstout-7f3a,duplicate,ʃ a,/);
  assert.match(lines[1], /""slot"":""root""/);
});

test('importing given names skips duplicates', () => {
  const data = draft();
  const first = importIntoDraft(data, 'person.given.male', 'Aram\nBel\nAram\n');
  assert.deepEqual(first, { added: 2, skipped: 0, target: 'person.given.male' });
  assert.deepEqual(data.person.given.male, ['Aram', 'Bel']);
  const second = importIntoDraft(data, 'person.given.male', 'Bel\nSin');
  assert.equal(second.added, 1);
});

test('importing roots parses glosses and merges duplicates', () => {
  const data = draft();
  const result = importIntoDraft(data, 'lexicon.roots', 'bab: gate, doorway\nnur: light\nbab: opening');
  assert.equal(result.added, 2);
  assert.deepEqual(data.lexicon.roots.bab, ['gate', 'doorway', 'opening']);
  assert.deepEqual(data.lexicon.roots.nur, ['light']);
});

test('CSV import uses the first column for lists and keeps templates whole', () => {
  const data = draft();
  importIntoDraft(data, 'person.given.neutral', 'name\nAri,unused\nNelli,unused');
  assert.deepEqual(data.person.given.neutral, ['Ari', 'Nelli']);

  importIntoDraft(data, 'person.templates', '{given} {family},{ignored}');
  assert.deepEqual(data.person.templates, ['{given} {family},{ignored}']);
});

test('preset summaries report missing packs and version drift', () => {
  const packs = new Map([
    ['aztec', { meta: { id: 'aztec' }, version: 1 }],
  ]);
  const preset = {
    laps: [
      { id: 'aztec', weight: 1 },
      { id: 'ancient-babylonian', weight: 1 },
    ],
    pins: { aztec: 2, 'ancient-babylonian': 1 },
  };
  const summary = summarizePreset(preset, packs);
  assert.deepEqual(summary.available.map((entry) => entry.id), ['aztec']);
  assert.deepEqual(summary.missing, ['ancient-babylonian']);
  assert.deepEqual(summary.versionMismatches, [{ id: 'aztec', expected: 2, actual: 1 }]);
});

test('unknown import targets are rejected', () => {
  assert.throws(() => importIntoDraft(draft(), 'person.unknown', 'x'), /Unknown import target/);
});
