import { readFileSync } from 'node:fs';
import { loadLap } from '../core/lap.js';

export const syntheticPackUrl = new URL('../packs/test-synthetic.lap', import.meta.url);

export function readSyntheticPack() {
  return JSON.parse(readFileSync(syntheticPackUrl, 'utf8'));
}

export function loadTestPack() {
  return loadLap(readSyntheticPack());
}

export function clonePack(id = 'test-synthetic-alt') {
  const copy = structuredClone(loadTestPack());
  copy.meta.id = id;
  return copy;
}
