const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const CODE_PREFIX = 'dilstout-';

export function hashSeed(input) {
  const text = String(input);
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function seedToCode(seed) {
  return `${CODE_PREFIX}${(seed >>> 0).toString(36)}`;
}

export function codeToSeed(code) {
  const text = String(code).trim().toLowerCase();
  if (!text.startsWith(CODE_PREFIX)) {
    throw new Error(`Seed code must start with "${CODE_PREFIX}": ${code}`);
  }
  const body = text.slice(CODE_PREFIX.length);
  if (!/^[0-9a-z]+$/.test(body)) {
    throw new Error(`Invalid seed code: ${code}`);
  }
  return Number.parseInt(body, 36) >>> 0;
}

export function seedFrom(input) {
  if (typeof input === 'number' && Number.isFinite(input)) return input >>> 0;
  const text = String(input ?? '');
  if (text.startsWith(CODE_PREFIX)) return codeToSeed(text);
  return hashSeed(text);
}

function createRngFromState(initialState) {
  let state = initialState >>> 0;
  let draws = 0;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    draws += 1;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  const rng = {
    get seed() {
      return initialState >>> 0;
    },
    get code() {
      return seedToCode(initialState);
    },
    get draws() {
      return draws;
    },
    next,
    int(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error(`int(maxExclusive) expects a positive integer, got ${maxExclusive}`);
      }
      return Math.floor(next() * maxExclusive);
    },
    pick(items) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('pick() expects a non-empty array');
      }
      return items[rng.int(items.length)];
    },
    weightedIndex(weights) {
      if (!Array.isArray(weights) || weights.length === 0) {
        throw new Error('weightedIndex() expects a non-empty array');
      }
      let total = 0;
      for (const weight of weights) {
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
          throw new Error(`Invalid weight: ${weight}`);
        }
        total += weight;
      }
      if (total <= 0) throw new Error('weightedIndex() needs at least one positive weight');
      let threshold = next() * total;
      for (let index = 0; index < weights.length; index += 1) {
        threshold -= weights[index];
        if (threshold < 0) return index;
      }
      return weights.length - 1;
    },
    fork(label) {
      return createRngFromState(hashSeed(`${rng.code}:${String(label)}`));
    },
  };

  return rng;
}

export function createRng(seed = 'dilstout') {
  return createRngFromState(seedFrom(seed));
}
