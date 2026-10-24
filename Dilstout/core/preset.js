import { hashSeed, seedToCode } from './rng.js';
import { assertValid, validateLpp } from './schema.js';

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) sorted[key] = sortValue(value[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function normalizePreset(raw) {
  const preset = clone(raw);
  preset.laps = (preset.laps ?? []).map((entry) => ({
    ...entry,
    weight: entry.weight ?? 1,
    overrides: entry.overrides ?? {},
  }));
  preset.strategy = preset.strategy ?? 'weighted-lottery';
  preset.renderer = preset.renderer ?? 'plain';
  preset.pins = preset.pins ?? {};
  return preset;
}

export function createPreset({
  name = 'Untitled mix',
  laps,
  seed,
  strategy = 'weighted-lottery',
  renderer = 'plain',
  blendStrength,
  pins = {},
  description,
  createdAt,
} = {}) {
  if (!Array.isArray(laps) || laps.length === 0) {
    throw new Error('createPreset() needs at least one lap entry');
  }
  const normalizedLaps = laps.map((entry) => ({
    id: entry.id,
    weight: entry.weight ?? 1,
    overrides: entry.overrides ?? {},
  }));
  const presetSeed = seed ?? seedToCode(hashSeed(canonicalJson(normalizedLaps)));
  const preset = {
    format: 'dilstout.lpp',
    version: 1,
    name,
    laps: normalizedLaps,
    seed: presetSeed,
    strategy,
    renderer,
    pins,
  };
  if (description !== undefined) preset.description = description;
  if (blendStrength !== undefined) preset.blendStrength = blendStrength;
  if (createdAt !== undefined) preset.createdAt = createdAt;
  return preset;
}

export function serializeLpp(preset) {
  const normalized = normalizePreset(preset);
  assertValid(validateLpp(normalized), 'Invalid .lpp');
  return `${JSON.stringify(sortValue(normalized), null, 2)}\n`;
}

export function parseLpp(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse .lpp JSON: ${error.message}`);
  }
  assertValid(validateLpp(raw), 'Invalid .lpp');
  return normalizePreset(raw);
}

export function presetHash(preset) {
  return hashSeed(canonicalJson(normalizePreset(preset))).toString(16).padStart(8, '0');
}
