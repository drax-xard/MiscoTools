import test from 'node:test';
import assert from 'node:assert/strict';
import { codeToSeed, createRng, hashSeed, seedToCode, seedFrom } from '../core/rng.js';

test('same seed produces the same sequence', () => {
  const a = createRng('dilstout-abc123');
  const b = createRng('dilstout-abc123');
  const left = Array.from({ length: 20 }, () => a.next());
  const right = Array.from({ length: 20 }, () => b.next());
  assert.deepEqual(left, right);
});

test('different seeds diverge', () => {
  const a = createRng('one');
  const b = createRng('two');
  assert.notEqual(a.next(), b.next());
});

test('seed codes round-trip', () => {
  for (const value of [0, 1, 42, 0xdeadbeef, 0xffffffff]) {
    const code = seedToCode(value);
    assert.match(code, /^dilstout-[0-9a-z]+$/);
    assert.equal(codeToSeed(code), value);
    assert.equal(seedFrom(code), value);
  }
});

test('arbitrary strings hash deterministically', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
  assert.equal(seedFrom('abc'), hashSeed('abc'));
});

test('weightedIndex follows configured weights', () => {
  const rng = createRng('weights');
  const counts = [0, 0];
  const draws = 10000;
  for (let index = 0; index < draws; index += 1) {
    counts[rng.weightedIndex([0.7, 0.3])] += 1;
  }
  assert.ok(Math.abs(counts[0] / draws - 0.7) < 0.02, `got ${counts[0] / draws}`);
  assert.ok(Math.abs(counts[1] / draws - 0.3) < 0.02, `got ${counts[1] / draws}`);
});

test('weightedIndex rejects invalid weights', () => {
  const rng = createRng('bad');
  assert.throws(() => rng.weightedIndex([0, 0]), /positive weight/);
  assert.throws(() => rng.weightedIndex([1, -1]), /Invalid weight/);
});

test('fork is deterministic and independent', () => {
  const parent = createRng('parent');
  const a = parent.fork('child');
  const b = parent.fork('child');
  assert.equal(a.next(), b.next());
  assert.notEqual(a.code, parent.code);
});

test('int and pick stay in range', () => {
  const rng = createRng('range');
  for (let index = 0; index < 200; index += 1) {
    const value = rng.int(5);
    assert.ok(Number.isInteger(value) && value >= 0 && value < 5);
  }
  assert.ok(['a', 'b', 'c'].includes(rng.pick(['a', 'b', 'c'])));
  assert.throws(() => rng.int(0), /positive integer/);
  assert.throws(() => rng.pick([]), /non-empty array/);
});
