import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPreset, canonicalJson, parseLpp, presetHash, serializeLpp } from '../core/preset.js';
import { loadTestPack, clonePack } from './helpers.js';

test('createPreset produces a deterministic seed from the mix', () => {
  const a = loadTestPack();
  const b = clonePack('test-synthetic-alt');
  const first = createPreset({ name: 'Mix', laps: [{ id: a.meta.id, weight: 0.5 }, { id: b.meta.id, weight: 0.5 }] });
  const second = createPreset({ name: 'Mix', laps: [{ id: a.meta.id, weight: 0.5 }, { id: b.meta.id, weight: 0.5 }] });
  assert.equal(first.seed, second.seed);
  assert.match(first.seed, /^dilstout-/);
});

test('.lpp round-trip is lossless', () => {
  const preset = createPreset({
    name: 'Babylonian / Aztec 50-50',
    laps: [
      { id: 'ancient-babylonian', weight: 0.5, overrides: { place: 0.7 } },
      { id: 'aztec', weight: 0.5, overrides: { person: 0.7 } },
    ],
    seed: 'dilstout-7f3a',
    strategy: 'weighted-lottery',
    renderer: 'plain',
    blendStrength: 0.5,
    pins: { 'ancient-babylonian': 1, aztec: 1 },
    createdAt: '2026-10-24T00:00:00Z',
  });
  const text = serializeLpp(preset);
  const parsed = parseLpp(text);
  assert.deepEqual(parsed, preset);
  assert.match(text, /"format": "dilstout\.lpp"/);
});

test('preset hash is stable and key-order independent', () => {
  const one = {
    format: 'dilstout.lpp',
    version: 1,
    name: 'Hash me',
    laps: [{ id: 'test-synthetic', weight: 1 }],
    seed: 'dilstout-abc',
    strategy: 'weighted-lottery',
    renderer: 'plain',
  };
  const two = {
    renderer: 'plain',
    strategy: 'weighted-lottery',
    seed: 'dilstout-abc',
    laps: [{ weight: 1, id: 'test-synthetic' }],
    name: 'Hash me',
    version: 1,
    format: 'dilstout.lpp',
  };
  assert.equal(canonicalJson(one), canonicalJson(two));
  assert.equal(presetHash(one), presetHash(two));
  assert.match(presetHash(one), /^[0-9a-f]{8}$/);
});

test('parseLpp normalizes omitted overrides and pins', () => {
  const text = JSON.stringify({
    format: 'dilstout.lpp',
    version: 1,
    name: 'Minimal',
    laps: [{ id: 'test-synthetic', weight: 1 }],
    seed: 'dilstout-abc',
    strategy: 'weighted-lottery',
    renderer: 'plain',
  });
  const parsed = parseLpp(text);
  assert.deepEqual(parsed.laps[0].overrides, {});
  assert.deepEqual(parsed.pins, {});
});

test('the bundled .lpp preset loads', () => {
  const url = new URL('../presets/synthetic-demo.lpp', import.meta.url);
  const preset = parseLpp(readFileSync(url, 'utf8'));
  assert.equal(preset.name, 'Synthetic demo');
  assert.equal(preset.seed, 'dilstout-7f3a');
  assert.equal(preset.laps[0].id, 'test-synthetic');
  assert.equal(preset.pins['test-synthetic'], 1);
});
