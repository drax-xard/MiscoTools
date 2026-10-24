import test from 'node:test';
import assert from 'node:assert/strict';
import { applyJoinRule, joinMorphemes, joinSegments, titleCase } from '../core/morphology.js';

const rules = [
  { type: 'dropDuplicate' },
  { type: 'elideVowel', from: 'a', to: '', when: 'beforeVowel' },
  { type: 'assimilate', from: 'n', to: 'm', before: ['b', 'p', 'm'] },
];

test('dropDuplicate removes a shared boundary character', () => {
  assert.equal(joinMorphemes('bara', 'an', rules), 'baran');
  assert.equal(joinMorphemes('kor', 'rin', rules), 'korin');
});

test('elideVowel drops a final vowel before a vowel', () => {
  assert.equal(joinMorphemes('bara', 'ilo', rules), 'barilo');
  assert.equal(joinMorphemes('duna', 'el', rules), 'dunel');
});

test('assimilate rewrites the coda before a listed onset', () => {
  assert.equal(joinMorphemes('tan', 'ba', rules), 'tamba');
  assert.equal(joinMorphemes('tan', 'ka', rules), 'tanka');
});

test('rules respect their condition', () => {
  assert.equal(applyJoinRule('bara', 'kor', rules[1]).left, 'bara');
  assert.equal(applyJoinRule('duna', 'el', rules[1]).left, 'dun');
});

test('joinSegments keeps provenance aligned with the joined text', () => {
  const joined = joinSegments(
    [
      { value: 'bara', lapId: 'a', slot: 'root' },
      { value: 'an', lapId: 'b', slot: 'suffix' },
    ],
    rules,
  );
  assert.equal(joined.text, 'baran');
  assert.equal(joined.segments.length, 2);
  assert.equal(joined.segments[0].lapId, 'a');
  assert.equal(joined.segments[1].lapId, 'b');
});

test('titleCase normalizes words and hyphens', () => {
  assert.equal(titleCase('nor-bara'), 'Nor-Bara');
  assert.equal(titleCase('order of the moon'), 'Order Of The Moon');
  assert.equal(titleCase('  ari   vela '), '  Ari   Vela ');
});
