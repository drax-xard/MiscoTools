import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../core/index.js';
import { registry } from '../core/registry.js';
import { validatePluginManifest } from '../core/schema.js';
import {
  HOST_API_VERSION,
  createPluginHost,
  validatePluginForHost,
} from '../core/plugin-host.js';
import { generate } from '../core/engine.js';
import * as examplePlugin from '../plugins/example-hooks/index.js';
import { loadTestPack } from './helpers.js';

const quietLogger = { log() {} };

function manifest(overrides = {}) {
  return {
    format: 'dilstout.plugin',
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '0.1.0',
    apiVersion: 1,
    entry: 'index.js',
    capabilities: ['slot'],
    ...overrides,
  };
}

test('the example plugin manifest is valid and in sync', () => {
  const fileManifest = JSON.parse(
    readFileSync(new URL('../plugins/example-hooks/plugin.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(validatePluginManifest(fileManifest), []);
  assert.deepEqual(validatePluginManifest(examplePlugin.manifest), []);
  assert.deepEqual(examplePlugin.manifest, fileManifest);
  assert.equal(validatePluginForHost(fileManifest).apiVersion, HOST_API_VERSION);
});

test('host rejects a newer API version before registering', () => {
  let called = false;
  const module = {
    manifest: manifest({ apiVersion: 2 }),
    register() {
      called = true;
    },
  };
  assert.throws(() => validatePluginForHost(module.manifest), /supports v1/);
  return assert.rejects(createPluginHost({ logger: quietLogger }).loadFromModule(module), /supports v1/).then(() => {
    assert.equal(called, false);
  });
});

test('invalid manifests are rejected with schema paths', async () => {
  const host = createPluginHost({ logger: quietLogger });
  const module = { manifest: manifest({ id: 'Bad Id', capabilities: ['teleport'] }), register() {} };
  await assert.rejects(host.loadFromModule(module), /Invalid plugin manifest/);
  assert.equal(host.list().length, 0);
});

test('modules need a manifest and a register function', async () => {
  const host = createPluginHost({ logger: quietLogger });
  await assert.rejects(host.loadFromModule({ register() {} }), /export a "manifest"/);
  await assert.rejects(host.loadFromModule({ manifest: manifest({ id: 'no-register' }) }), /register\(\) function/);
});

test('a failed registration rolls back earlier registrations', async () => {
  const host = createPluginHost({ logger: quietLogger });
  const module = {
    manifest: manifest({ id: 'rollback-demo', capabilities: ['slot', 'exporter'] }),
    register({ registry: scoped }) {
      scoped.slotResolvers.register('rollbackSlot', { available: () => true, resolve: () => ({ value: 'x' }) });
      scoped.exporters.register('rollbackExporter', { export: () => ({ text: 'x' }) });
      throw new Error('boom');
    },
  };
  await assert.rejects(host.loadFromModule(module), /boom/);
  assert.equal(registry.slotResolvers.has('rollbackSlot'), false);
  assert.equal(registry.exporters.has('rollbackExporter'), false);
  assert.equal(host.list().length, 0);
});

test('registry collisions fail cleanly and leave built-ins intact', async () => {
  const host = createPluginHost({ logger: quietLogger });
  const module = {
    manifest: manifest({ id: 'collision-demo', capabilities: ['slot', 'exporter'] }),
    register({ registry: scoped }) {
      scoped.exporters.register('collisionExporter', { export: () => ({ text: 'x' }) });
      scoped.slotResolvers.register('root', { available: () => true, resolve: () => ({ value: 'x' }) });
    },
  };
  await assert.rejects(host.loadFromModule(module), /duplicate extension id "root"/);
  assert.equal(registry.exporters.has('collisionExporter'), false);
  assert.ok(registry.slotResolvers.has('root'));
  assert.equal(host.list().length, 0);
});

test('the example plugin registers, generates, exports, and unloads cleanly', async () => {
  const host = createPluginHost({ logger: quietLogger });
  await host.loadFromModule(examplePlugin, { source: 'test' });
  try {
    assert.equal(host.list().length, 1);
    assert.ok(registry.slotResolvers.has('syllable'));
    assert.ok(registry.categories.has('syllable-chant'));
    assert.ok(registry.exporters.has('markdown-table'));
    assert.ok(registry.uiPanels.has('example-hooks.panel'));

    await assert.rejects(
      host.loadFromModule(examplePlugin, { source: 'test' }),
      /already loaded/,
    );

    const lap = loadTestPack();
    const results = generate({ laps: [lap], category: 'syllable-chant', count: 12, seed: 'dilstout-7f3a' });
    assert.equal(results.length, 12);
    assert.ok(results.every((result) => result.name.length > 0));
    assert.ok(results.every((result) => result.phonemes.length > 0));

    const exporter = registry.exporters.get('markdown-table');
    const output = exporter.export(results);
    assert.match(output.filename, /\.md$/);
    assert.match(output.text, /\| Name \| Category \| Pool \|/);
    assert.ok(output.text.includes(results[0].name));
  } finally {
    host.unload('example-hooks');
  }

  assert.equal(host.list().length, 0);
  assert.equal(registry.categories.has('syllable-chant'), false);
  assert.equal(registry.exporters.has('markdown-table'), false);
  assert.equal(registry.uiPanels.has('example-hooks.panel'), false);
  assert.equal(registry.slotResolvers.has('syllable'), false);
  assert.throws(
    () => generate({ laps: [loadTestPack()], category: 'syllable-chant', count: 1 }),
    /unknown extension/,
  );
});
