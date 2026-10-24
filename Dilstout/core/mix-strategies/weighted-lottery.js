export const id = 'weighted-lottery';
export const label = 'Per-slot weighted lottery';
export const description = 'Each template and slot draws a source language pack using the active weights.';
export const implemented = true;

export function selectSource({ category, slot, laps, rng, weights }) {
  if (!Array.isArray(laps) || laps.length === 0) {
    throw new Error('weighted-lottery: no eligible language packs');
  }
  if (laps.length === 1) return laps[0].meta.id;

  const ids = laps.map((lap) => lap.meta.id);
  const values = ids.map((lapId) => {
    if (!weights) return 1;
    const weight = weights.get(lapId);
    if (weight === undefined) return 0;
    return weight;
  });

  if (values.every((value) => value === 0)) {
    throw new Error(`weighted-lottery: no positive weight for category "${category}" slot "${slot}"`);
  }

  const index = rng.weightedIndex(values);
  return ids[index];
}
