function lapIdentifier(lap) {
  if (!lap || !lap.meta || typeof lap.meta.id !== 'string') {
    throw new Error('Mixer entry is missing a lap.meta.id');
  }
  return lap.meta.id;
}

export function createMixer(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('createMixer() needs at least one entry');
  }

  const seen = new Set();
  const normalized = entries.map((entry) => {
    const id = lapIdentifier(entry.lap);
    if (seen.has(id)) throw new Error(`Duplicate language pack in mixer: "${id}"`);
    seen.add(id);
    const weight = entry.weight ?? 1;
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
      throw new Error(`Invalid weight for "${id}": ${weight}`);
    }
    return {
      lap: entry.lap,
      id,
      weight,
      overrides: entry.overrides ?? {},
    };
  });

  const baseTotal = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  if (baseTotal <= 0) throw new Error('Mixer needs at least one language pack with a positive weight');

  const mixer = {
    entries: normalized,
    laps: normalized.map((entry) => entry.lap),
    ids: normalized.map((entry) => entry.id),
    baseWeights() {
      const weights = new Map();
      for (const entry of normalized) weights.set(entry.id, entry.weight / baseTotal);
      return weights;
    },
    weightsFor(category) {
      const weights = new Map();
      let total = 0;
      for (const entry of normalized) {
        const override = entry.overrides[category];
        if (override !== undefined && (typeof override !== 'number' || !Number.isFinite(override) || override < 0)) {
          throw new Error(`Invalid override for "${entry.id}" in category "${category}": ${override}`);
        }
        const weight = entry.weight * (override ?? 1);
        weights.set(entry.id, weight);
        total += weight;
      }
      if (total <= 0) {
        throw new Error(`No active language packs for category "${category}"`);
      }
      for (const [id, weight] of weights) weights.set(id, weight / total);
      return weights;
    },
    weightOf(lapId, category) {
      return mixer.weightsFor(category).get(lapId) ?? 0;
    },
    eligibleWeights(category, eligibleIds) {
      const allowed = new Set(eligibleIds);
      const weights = new Map();
      let total = 0;
      for (const [id, weight] of mixer.weightsFor(category)) {
        if (!allowed.has(id)) continue;
        weights.set(id, weight);
        total += weight;
      }
      if (total <= 0) return weights;
      for (const [id, weight] of weights) weights.set(id, weight / total);
      return weights;
    },
  };

  return mixer;
}

export function mixerFromPreset(preset, laps) {
  const byId = new Map();
  for (const lap of laps) byId.set(lapIdentifier(lap), lap);
  const missing = preset.laps.map((entry) => entry.id).filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`Preset references missing language pack(s): ${missing.join(', ')}`);
  }
  return createMixer(
    preset.laps.map((entry) => ({
      lap: byId.get(entry.id),
      weight: entry.weight,
      overrides: entry.overrides,
    })),
  );
}
