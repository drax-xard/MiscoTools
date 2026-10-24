import test from 'node:test';
import assert from 'node:assert/strict';
import { createMixer, mixerFromPreset } from '../core/mixer.js';
import { createPreset } from '../core/preset.js';
import { createRng } from '../core/rng.js';
import { selectSource } from '../core/mix-strategies/weighted-lottery.js';
import { clonePack, loadTestPack } from './helpers.js';

test('base weights are normalized', () => {
  const mixer = createMixer([
    { lap: loadTestPack(), weight: 3 },
    { lap: clonePack(), weight: 1 },
  ]);
  const weights = mixer.baseWeights();
  assert.equal(weights.get('test-synthetic'), 0.75);
  assert.equal(weights.get('test-synthetic-alt'), 0.25);
});

test('category overrides change normalized weights', () => {
  const mixer = createMixer([
    { lap: loadTestPack(), weight: 1, overrides: { place: 3 } },
    { lap: clonePack(), weight: 1, overrides: { place: 1 } },
  ]);
  const weights = mixer.weightsFor('place');
  assert.equal(weights.get('test-synthetic'), 0.75);
  assert.equal(weights.get('test-synthetic-alt'), 0.25);
  assert.equal(mixer.weightOf('test-synthetic', 'person'), 0.5);
});

test('eligibleWeights filters and renormalizes', () => {
  const mixer = createMixer([
    { lap: loadTestPack(), weight: 1 },
    { lap: clonePack(), weight: 3 },
  ]);
  const weights = mixer.eligibleWeights('person', ['test-synthetic']);
  assert.equal(weights.get('test-synthetic'), 1);
  assert.equal(weights.has('test-synthetic-alt'), false);
});

test('duplicate packs and zero weights are rejected', () => {
  assert.throws(
    () =>
      createMixer([
        { lap: loadTestPack(), weight: 1 },
        { lap: loadTestPack(), weight: 1 },
      ]),
    /Duplicate language pack/,
  );
  assert.throws(() => createMixer([{ lap: loadTestPack(), weight: 0 }]), /positive weight/);
});

test('mixerFromPreset resolves packs and reports missing ones', () => {
  const lap = loadTestPack();
  const preset = createPreset({ name: 'One', laps: [{ id: lap.meta.id, weight: 1 }] });
  const mixer = mixerFromPreset(preset, [lap]);
  assert.equal(mixer.ids[0], lap.meta.id);

  const missing = createPreset({ name: 'Missing', laps: [{ id: 'nope', weight: 1 }] });
  assert.throws(() => mixerFromPreset(missing, [lap]), /missing language pack/);
});

test('weighted lottery matches configured source weights', () => {
  const packs = [loadTestPack(), clonePack()];
  const weights = new Map([
    [packs[0].meta.id, 0.7],
    [packs[1].meta.id, 0.3],
  ]);
  const rng = createRng('lottery');
  const counts = { 'test-synthetic': 0, 'test-synthetic-alt': 0 };
  const draws = 10000;
  for (let index = 0; index < draws; index += 1) {
    const id = selectSource({ category: 'person', slot: 'given', laps: packs, rng, weights, state: {} });
    counts[id] += 1;
  }
  assert.ok(Math.abs(counts['test-synthetic'] / draws - 0.7) < 0.02);
  assert.ok(Math.abs(counts['test-synthetic-alt'] / draws - 0.3) < 0.02);
});
