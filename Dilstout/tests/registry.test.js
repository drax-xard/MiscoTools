import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, registry } from '../core/registry.js';
import '../core/index.js';

test('registries reject duplicate ids', () => {
  const target = createRegistry('test');
  target.register('one', { value: 1 });
  assert.throws(() => target.register('one', { value: 2 }), /duplicate extension id "one"/);
});

test('registries report unknown ids', () => {
  const target = createRegistry('test');
  assert.throws(() => target.get('missing'), /unknown extension "missing"/);
  assert.equal(target.has('missing'), false);
  assert.equal(target.getRecord('missing'), null);
});

test('list includes extension metadata', () => {
  const target = createRegistry('test');
  target.register('one', { value: 1 }, { label: 'One' });
  assert.deepEqual(target.list(), [{ id: 'one', label: 'One' }]);
});

test('built-ins are registered', () => {
  assert.ok(registry.mixStrategies.has('weighted-lottery'));
  assert.ok(registry.renderers.has('plain'));
  assert.ok(registry.phonemeResolvers.has('romanization'));
  assert.ok(registry.categories.has('person'));
  assert.ok(registry.categories.has('place'));
  assert.ok(registry.categories.has('organization'));
  assert.ok(registry.categories.has('domain'));
  for (const slot of ['root', 'given', 'family', 'clan', 'suffix', 'terrain', 'directional']) {
    assert.ok(registry.slotResolvers.has(slot), slot);
  }
});

test('deferred strategies are listed but marked unimplemented', () => {
  const strategies = registry.mixStrategies.list();
  const ids = strategies.map((entry) => entry.id);
  assert.ok(ids.includes('template-crossover'));
  assert.ok(ids.includes('strand-blend'));
  assert.equal(strategies.find((entry) => entry.id === 'template-crossover').implemented, false);
  assert.equal(strategies.find((entry) => entry.id === 'weighted-lottery').implemented, true);
});

test('registerBuiltins is idempotent', async () => {
  const { registerBuiltins } = await import('../core/index.js');
  assert.doesNotThrow(() => registerBuiltins());
  assert.doesNotThrow(() => registerBuiltins());
});
