import { registry } from './registry.js';
import * as weightedLottery from './mix-strategies/weighted-lottery.js';
import * as crossover from './mix-strategies/crossover.js';
import * as strandBlend from './mix-strategies/strand-blend.js';
import * as plainRenderer from './renderers/plain.js';
import * as romanization from './phoneme-resolvers/romanization.js';
import { builtinSlotResolvers } from './slots.js';
import { builtinCategories } from './categories.js';

function registerStrategy(module) {
  if (!registry.mixStrategies.has(module.id)) {
    registry.mixStrategies.register(module.id, module, {
      label: module.label,
      description: module.description,
      implemented: module.implemented,
    });
  }
}

export function registerBuiltins() {
  registerStrategy(weightedLottery);
  registerStrategy(crossover);
  registerStrategy(strandBlend);

  if (!registry.renderers.has(plainRenderer.id)) {
    registry.renderers.register(plainRenderer.id, plainRenderer, {
      label: plainRenderer.label,
      description: plainRenderer.description,
    });
  }

  if (!registry.phonemeResolvers.has(romanization.id)) {
    registry.phonemeResolvers.register(romanization.id, romanization, {
      label: romanization.label,
      description: romanization.description,
    });
  }

  for (const [slot, resolver] of Object.entries(builtinSlotResolvers)) {
    if (!registry.slotResolvers.has(slot)) {
      registry.slotResolvers.register(slot, resolver, { label: slot });
    }
  }

  for (const category of builtinCategories) {
    if (!registry.categories.has(category.id)) {
      registry.categories.register(category.id, category, {
        label: category.label,
        description: category.description,
      });
    }
  }
}

registerBuiltins();

export { registry, createRegistry } from './registry.js';
export { createRng, hashSeed, seedToCode, codeToSeed, seedFrom } from './rng.js';
export { loadLap, parseLap, normalizeLap, migrateLap, lapId } from './lap.js';
export {
  createPreset,
  normalizePreset,
  serializeLpp,
  parseLpp,
  presetHash,
  canonicalJson,
} from './preset.js';
export { createMixer, mixerFromPreset } from './mixer.js';
export { generate, parseTemplate } from './engine.js';
export { validate, validateLap, validateLpp, validatePluginManifest } from './schema.js';
export { buildDefaultPreset } from './defaults.js';
export { createPluginHost, validatePluginForHost, HOST_API_VERSION } from './plugin-host.js';
