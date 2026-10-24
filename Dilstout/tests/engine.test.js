import test from 'node:test';
import assert from 'node:assert/strict';
import '../core/index.js';
import { generate } from '../core/engine.js';
import { buildDefaultPreset } from '../core/defaults.js';
import { createPreset, parseLpp, serializeLpp } from '../core/preset.js';
import { clonePack, loadTestPack } from './helpers.js';

const seed = 'dilstout-7f3a';

test('generation is deterministic for the same seed', () => {
  const lap = loadTestPack();
  const first = generate({ laps: [lap], category: 'person', count: 8, seed });
  const second = generate({ laps: [lap], category: 'person', count: 8, seed });
  assert.deepEqual(first, second);
});

test('different seeds change output', () => {
  const lap = loadTestPack();
  const first = generate({ laps: [lap], category: 'person', count: 5, seed });
  const second = generate({ laps: [lap], category: 'person', count: 5, seed: 'dilstout-000001' });
  assert.notDeepEqual(
    first.map((entry) => entry.name),
    second.map((entry) => entry.name),
  );
});

test('names contain no unresolved slots or nullish text', () => {
  const lap = loadTestPack();
  for (const category of ['person', 'place', 'organization', 'domain']) {
    const results = generate({ laps: [lap], category, count: 25, seed });
    assert.equal(results.length, 25);
    for (const result of results) {
      assert.doesNotMatch(result.name, /[{}]|undefined|null/i, result.name);
      assert.ok(result.name.trim().length >= 2, result.name);
      assert.ok(Array.isArray(result.warnings));
    }
  }
});

test('a 1,000-name batch has no unresolved slots', () => {
  const lap = loadTestPack();
  const results = generate({ laps: [lap], category: 'person', count: 1000, seed });
  assert.equal(results.length, 1000);
  for (const result of results) {
    assert.doesNotMatch(result.name, /[{}]|undefined|null/i, result.name);
    assert.ok(result.phonemes.length > 0, result.name);
  }
  assert.ok(new Set(results.map((entry) => entry.name)).size > 900);
});

test('generated batches are unique', () => {
  const lap = loadTestPack();
  for (const category of ['person', 'place', 'organization', 'domain']) {
    const results = generate({ laps: [lap], category, count: 20, seed });
    const names = results.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length, `${category} produced duplicates`);
  }
});

test('every result carries provenance and phonemes with source packs', () => {
  const lap = loadTestPack();
  const results = generate({ laps: [lap], category: 'person', count: 10, seed });
  for (const result of results) {
    assert.equal(result.seed, seed);
    assert.ok(result.provenance.length > 0);
    for (const entry of result.provenance) {
      assert.equal(entry.lapId, lap.meta.id);
      assert.ok(typeof entry.value === 'string' && entry.value.length > 0);
    }
    assert.ok(result.phonemes.length > 0, `no phonemes for ${result.name}`);
    for (const phoneme of result.phonemes) {
      assert.equal(phoneme.lapId, lap.meta.id);
      assert.ok(typeof phoneme.symbol === 'string' && phoneme.symbol.length > 0);
      assert.ok(phoneme.features === null || typeof phoneme.features === 'object');
    }
  }
});

test('category pools are reported', () => {
  const lap = loadTestPack();
  const organizations = generate({ laps: [lap], category: 'organization', count: 10, seed });
  assert.ok(organizations.every((entry) => ['religious', 'political', 'military', 'guild'].includes(entry.pool)));

  const domains = generate({ laps: [lap], category: 'domain', count: 10, seed });
  assert.ok(
    domains.every((entry) => ['nation', 'kingdom', 'empire', 'province', 'district', 'town'].includes(entry.pool)),
  );
});

test('a saved .lpp preset reproduces generation', () => {
  const lap = loadTestPack();
  const preset = buildDefaultPreset({ laps: [lap], name: 'Solo mix', seed });
  const parsed = parseLpp(serializeLpp(preset));

  const direct = generate({ laps: [lap], preset, category: 'place', count: 6 });
  const reloaded = generate({ laps: [lap], preset: parsed, category: 'place', count: 6 });
  assert.deepEqual(reloaded, direct);
  assert.equal(direct[0].seed, seed);
});

test('a two-pack mix draws from both packs', () => {
  const first = loadTestPack();
  const second = clonePack();
  const preset = createPreset({
    name: 'Even mix',
    laps: [
      { id: first.meta.id, weight: 0.5 },
      { id: second.meta.id, weight: 0.5 },
    ],
    seed,
  });
  const results = generate({ laps: [first, second], preset, category: 'person', count: 40 });
  const sources = new Set(results.flatMap((entry) => entry.provenance.map((item) => item.lapId)));
  assert.deepEqual([...sources].sort(), [first.meta.id, second.meta.id].sort());
});

test('category overrides can exclude a pack', () => {
  const first = loadTestPack();
  const second = clonePack();
  const preset = createPreset({
    name: 'Names from the second pack only',
    laps: [
      { id: first.meta.id, weight: 1, overrides: { person: 0 } },
      { id: second.meta.id, weight: 1, overrides: { person: 1 } },
    ],
    seed,
  });
  const results = generate({ laps: [first, second], preset, category: 'person', count: 15 });
  const sources = new Set(results.flatMap((entry) => entry.provenance.map((item) => item.lapId)));
  assert.deepEqual([...sources], [second.meta.id]);
});

test('generation rejects bad input', () => {
  const lap = loadTestPack();
  assert.throws(() => generate({ laps: [] }), /at least one language pack/);
  assert.throws(() => generate({ laps: [lap], count: 0 }), /between 1 and 10000/);
  assert.throws(() => generate({ laps: [lap], count: 1.5 }), /between 1 and 10000/);
  assert.throws(() => generate({ laps: [lap], category: 'starship' }), /unknown extension/);
  assert.throws(
    () => generate({ laps: [lap], category: 'person', strategy: 'template-crossover' }),
    /not implemented yet/,
  );
});
