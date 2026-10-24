import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLap } from '../core/lap.js';
import { parseLpp, createPreset, serializeLpp } from '../core/preset.js';
import { validateLap, validateLpp, validatePluginManifest } from '../core/schema.js';
import { readSyntheticPack, loadTestPack } from './helpers.js';

test('the synthetic pack validates and normalizes defaults', () => {
  const raw = readSyntheticPack();
  assert.deepEqual(validateLap(raw), []);
  const lap = loadLap(raw);
  assert.equal(lap.meta.id, 'test-synthetic');
  assert.deepEqual(lap.lexicon.articles, ['the', 'a']);
  assert.equal(lap.person.order, 'given-family');
  assert.equal(lap.voice.basePitch, 120);
});

test('missing required fields report a path', () => {
  const raw = readSyntheticPack();
  delete raw.meta.name;
  const errors = validateLap(raw);
  assert.ok(errors.some((error) => error.includes('$.meta.name')), errors.join('\n'));
  assert.throws(() => loadLap(raw), /\$\.meta\.name/);
});

test('wrong format and unsupported versions are rejected', () => {
  const wrongFormat = readSyntheticPack();
  wrongFormat.format = 'something.else';
  assert.ok(validateLap(wrongFormat).some((error) => error.includes('$.format')));

  const future = readSyntheticPack();
  future.version = 2;
  assert.throws(() => loadLap(future), /Unsupported \.lap version 2/);
});

test('bad phoneme types report an item path', () => {
  const raw = readSyntheticPack();
  raw.phonology.inventory[0].type = 'tone';
  const errors = validateLap(raw);
  assert.ok(errors.some((error) => error.includes('$.phonology.inventory[0].type')), errors.join('\n'));
});

test('preset schema rejects bad weights', () => {
  const preset = createPreset({
    name: 'Test',
    laps: [{ id: loadTestPack().meta.id, weight: 1 }],
  });
  assert.deepEqual(validateLpp(preset), []);

  preset.laps[0].weight = 'heavy';
  const errors = validateLpp(preset);
  assert.ok(errors.some((error) => error.includes('$.laps[0].weight')), errors.join('\n'));
  assert.throws(() => serializeLpp(preset), /\.laps\[0\]\.weight/);
});

test('preset parser reports malformed JSON clearly', () => {
  assert.throws(() => parseLpp('{ not json'), /Could not parse \.lpp JSON/);
});

test('plugin manifests validate capabilities', () => {
  const manifest = {
    format: 'dilstout.plugin',
    id: 'example-hooks',
    name: 'Example Hooks',
    version: '0.1.0',
    apiVersion: 1,
    entry: 'index.js',
    capabilities: ['slot', 'renderer'],
  };
  assert.deepEqual(validatePluginManifest(manifest), []);

  manifest.capabilities = ['teleport'];
  assert.ok(validatePluginManifest(manifest).some((error) => error.includes('capabilities[0]')));
});
