import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../core/index.js';
import { loadLap } from '../core/lap.js';
import { generate } from '../core/engine.js';
import { parseTemplate } from '../core/engine.js';
import { parseLpp } from '../core/preset.js';
import { checkPhonotactics } from '../core/validate.js';
import { registry } from '../core/registry.js';

const seed = 'dilstout-7f3a';

const packs = [
  {
    file: new URL('../packs/ancient-babylonian.lap', import.meta.url),
    id: 'ancient-babylonian',
  },
  {
    file: new URL('../packs/aztec.lap', import.meta.url),
    id: 'aztec',
  },
];

function load(file) {
  return loadLap(readFileSync(file, 'utf8'));
}

function collectStrings(lap) {
  const values = [
    ...Object.keys(lap.lexicon.roots),
    ...lap.lexicon.prefixes,
    ...lap.lexicon.suffixes,
    ...lap.lexicon.epithets,
    ...lap.lexicon.honorifics,
    ...lap.lexicon.numerals,
    ...lap.lexicon.articles,
    ...lap.person.given.male,
    ...lap.person.given.female,
    ...lap.person.given.neutral,
    ...lap.person.clan,
    ...lap.place.settlementTypes,
    ...lap.place.settlementSuffixes,
    ...lap.place.terrainMorphemes,
    ...lap.place.directionalAffixes,
  ];
  for (const template of [
    ...lap.person.templates,
    ...lap.person.surnamePatterns,
    ...lap.place.templates,
    ...Object.values(lap.organization).flat(),
    ...Object.values(lap.domain).flat(),
  ]) {
    for (const token of parseTemplate(template)) {
      if (token.type === 'literal') values.push(token.value);
    }
  }
  return values;
}

function allTemplates(lap) {
  return [
    ...lap.person.templates,
    ...lap.person.surnamePatterns,
    ...lap.place.templates,
    ...Object.values(lap.organization).flat(),
    ...Object.values(lap.domain).flat(),
  ];
}

for (const { file, id } of packs) {
  test(`${id} loads with complete provenance metadata`, () => {
    const lap = load(file);
    assert.equal(lap.meta.id, id);
    assert.ok(lap.meta.sources.length >= 3);
    assert.ok(lap.meta.license.length > 0);
    assert.equal(lap.meta.status, 'experimental');
    assert.ok(lap.phonology.inventory.length >= 10);
    assert.ok(Object.keys(lap.phonology.romanization).length >= 10);
    assert.ok(lap.phonology.prosody.stress);
    assert.ok(lap.voice.preferredSpeaker);
  });

  test(`${id} has no symbols outside its own inventory`, () => {
    const lap = load(file);
    const bad = [];
    for (const value of collectStrings(lap)) {
      const unknown = checkPhonotactics(value, lap);
      if (unknown.length > 0) bad.push(`${value}: ${[...new Set(unknown)].join(',')}`);
    }
    assert.deepEqual(bad, []);
  });

  test(`${id} declares only resolvable slots`, () => {
    const lap = load(file);
    const slots = new Set();
    for (const template of allTemplates(lap)) {
      for (const token of parseTemplate(template)) {
        if (token.type === 'slot') slots.add(token.slot);
      }
    }
    assert.ok(slots.size > 0);
    for (const slot of slots) {
      assert.ok(registry.slotResolvers.has(slot), `missing resolver for ${slot}`);
      assert.equal(registry.slotResolvers.get(slot).available(lap), true, `${slot} unavailable in ${id}`);
    }
  });

  test(`${id} generates 100 unique names per category`, () => {
    const lap = load(file);
    for (const category of ['person', 'place', 'organization', 'domain']) {
      const results = generate({ laps: [lap], category, count: 100, seed });
      assert.equal(results.length, 100);
      assert.equal(new Set(results.map((entry) => entry.name)).size, 100, category);
      for (const result of results) {
        assert.doesNotMatch(result.name, /[{}]|undefined|null/i);
        assert.ok(result.phonemes.length > 0);
        assert.equal(result.warnings.length, 0, `${result.name}: ${JSON.stringify(result.warnings)}`);
      }
    }
  });
}

test('the 50/50 preset mixes both packs', () => {
  const preset = parseLpp(readFileSync(new URL('../presets/babylonian-aztec-50-50.lpp', import.meta.url), 'utf8'));
  assert.equal(preset.laps.length, 2);
  assert.equal(preset.blendStrength, 0.5);

  const results = generate({
    laps: packs.map((pack) => load(pack.file)),
    preset,
    category: 'person',
    count: 120,
  });
  const sources = new Set(results.flatMap((entry) => entry.provenance.map((item) => item.lapId)));
  assert.deepEqual([...sources].sort(), ['ancient-babylonian', 'aztec']);

  const phonemeSources = new Set(results.flatMap((entry) => entry.phonemes.map((item) => item.lapId)));
  assert.deepEqual([...phonemeSources].sort(), ['ancient-babylonian', 'aztec']);
});
