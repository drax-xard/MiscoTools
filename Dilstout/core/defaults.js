import { createPreset } from './preset.js';

export function buildDefaultPreset({ laps, name = 'Untitled mix', seed, strategy, renderer } = {}) {
  if (!Array.isArray(laps) || laps.length === 0) {
    throw new Error('buildDefaultPreset() needs at least one language pack');
  }
  return createPreset({
    name,
    laps: laps.map((lap) => ({ id: lap.meta.id, weight: 1, overrides: {} })),
    seed,
    strategy,
    renderer,
    pins: Object.fromEntries(laps.map((lap) => [lap.meta.id, lap.version])),
  });
}
