import { registry } from './registry.js';
import { createRng } from './rng.js';
import { createMixer, mixerFromPreset } from './mixer.js';
import { joinSegments } from './morphology.js';
import { fatalIssues, validateName } from './validate.js';

const SLOT_PATTERN = /\{([A-Za-z][A-Za-z0-9_.-]*)\}/g;
const MAX_DEPTH = 4;
const MAX_ATTEMPTS = 60;

export function parseTemplate(template) {
  const tokens = [];
  let cursor = 0;
  for (const match of template.matchAll(SLOT_PATTERN)) {
    if (match.index > cursor) {
      tokens.push({ type: 'literal', value: template.slice(cursor, match.index) });
    }
    tokens.push({ type: 'slot', slot: match[1] });
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) {
    tokens.push({ type: 'literal', value: template.slice(cursor) });
  }
  return tokens;
}

function normalizeResolution(raw, slot) {
  if (typeof raw === 'string') return { value: raw };
  if (raw && typeof raw.value === 'string') return raw;
  throw new Error(`Slot resolver for "${slot}" returned an invalid value`);
}

function buildContext(categorySpec, rng) {
  const context = {};
  if (Array.isArray(categorySpec.genders) && categorySpec.genders.length > 0) {
    context.gender = rng.pick(categorySpec.genders);
  }
  return context;
}

function pickTemplate({ category, categorySpec, mixer, rng }) {
  const weights = mixer.weightsFor(category);
  const candidates = [];
  for (const entry of mixer.entries) {
    const pools = categorySpec.pools(entry.lap).filter((pool) => pool.templates.length > 0);
    if (pools.length === 0) continue;
    const lapWeight = weights.get(entry.id);
    for (const pool of pools) {
      for (const template of pool.templates) {
        candidates.push({
          lapId: entry.id,
          poolId: pool.id,
          template,
          weight: lapWeight / pools.length / pool.templates.length,
        });
      }
    }
  }
  if (candidates.length === 0) {
    throw new Error(`No language pack provides templates for category "${category}"`);
  }
  const index = rng.weightedIndex(candidates.map((candidate) => candidate.weight));
  return candidates[index];
}

function expandTemplate({
  template,
  templateLap,
  depth,
  category,
  mixer,
  lapMap,
  rng,
  strategy,
  state,
  context,
}) {
  if (depth > MAX_DEPTH) {
    throw new Error(`Template expansion exceeded ${MAX_DEPTH} levels: "${template}"`);
  }

  const segments = [];
  for (const token of parseTemplate(template)) {
    if (token.type === 'literal') {
      segments.push({ value: token.value, lapId: templateLap.meta.id, slot: null });
      continue;
    }

    const slot = token.slot;
    const resolver = registry.slotResolvers.get(slot);
    const eligible = mixer.laps.filter((lap) => resolver.available(lap));
    if (eligible.length === 0) {
      throw new Error(`No language pack can resolve slot "${slot}" for category "${category}"`);
    }

    const weights = mixer.eligibleWeights(
      category,
      eligible.map((lap) => lap.meta.id),
    );
    const sourceId = strategy.selectSource({
      category,
      slot,
      laps: eligible,
      rng,
      state,
      weights,
    });
    const sourceLap = lapMap.get(sourceId);
    const resolved = normalizeResolution(
      resolver.resolve({ lap: sourceLap, rng, context, category }),
      slot,
    );

    if (resolved.template || resolved.value.includes('{')) {
      segments.push(
        ...expandTemplate({
          template: resolved.value,
          templateLap: sourceLap,
          depth: depth + 1,
          category,
          mixer,
          lapMap,
          rng,
          strategy,
          state,
          context,
        }),
      );
    } else {
      segments.push({
        value: resolved.value,
        lapId: sourceId,
        slot,
        ...(resolved.gloss ? { gloss: resolved.gloss } : {}),
      });
    }
  }
  return segments;
}

function makeAttempt({ category, categorySpec, mixer, lapMap, rng, strategy, state, renderer }) {
  const picked = pickTemplate({ category, categorySpec, mixer, rng });
  const templateLap = lapMap.get(picked.lapId);
  const context = buildContext(categorySpec, rng);
  const segments = expandTemplate({
    template: picked.template,
    templateLap,
    depth: 0,
    category,
    mixer,
    lapMap,
    rng,
    strategy,
    state,
    context,
  });
  const joined = joinSegments(segments, templateLap.phonology.joinRules);
  const name = renderer.render({
    text: joined.text,
    segments: joined.segments,
    category,
  });
  const check = validateName(name, { laps: mixer.laps });
  return {
    name,
    segments: joined.segments,
    templateLap,
    poolId: picked.poolId,
    issues: check.issues,
  };
}

function buildResult({ attempt, category, poolId, rng, phonemeResolver, lapMap, warnings }) {
  return {
    name: attempt.name,
    category,
    pool: poolId,
    seed: rng.code,
    phonemes: phonemeResolver.resolve({
      segments: attempt.segments,
      lapMap,
      fallbackLap: attempt.templateLap,
    }),
    provenance: attempt.segments.map((segment) => ({
      slot: segment.slot,
      lapId: segment.lapId,
      value: segment.value,
      ...(segment.gloss ? { gloss: segment.gloss } : {}),
    })),
    warnings,
  };
}

export function generate({
  laps,
  preset = null,
  category = 'person',
  count = 1,
  seed,
  strategy,
  renderer,
} = {}) {
  if (!Array.isArray(laps) || laps.length === 0) {
    throw new Error('generate() needs at least one language pack');
  }
  if (!Number.isInteger(count) || count < 1 || count > 10000) {
    throw new Error(`count must be an integer between 1 and 10000, got ${count}`);
  }

  const categorySpec = registry.categories.get(category);
  const mixer = preset ? mixerFromPreset(preset, laps) : createMixer(laps.map((lap) => ({ lap, weight: 1 })));
  const lapMap = new Map(mixer.laps.map((lap) => [lap.meta.id, lap]));

  const strategyId = strategy ?? preset?.strategy ?? 'weighted-lottery';
  const strategyModule = registry.mixStrategies.get(strategyId);
  if (strategyModule.implemented === false) {
    throw new Error(`Mix strategy "${strategyId}" is not implemented yet`);
  }

  const rendererId = renderer ?? preset?.renderer ?? 'plain';
  const rendererModule = registry.renderers.get(rendererId);
  const phonemeResolver = registry.phonemeResolvers.get('romanization');

  const rng = createRng(seed ?? preset?.seed ?? 'dilstout');
  const state = {};

  const results = [];
  const seen = new Set();

  while (results.length < count) {
    let accepted = null;
    let last = null;
    let lastIssues = [];

    for (let attemptIndex = 0; attemptIndex < MAX_ATTEMPTS; attemptIndex += 1) {
      const attempt = makeAttempt({
        category,
        categorySpec,
        mixer,
        lapMap,
        rng,
        strategy: strategyModule,
        state,
        renderer: rendererModule,
      });
      last = attempt;
      if (fatalIssues(attempt.issues).length > 0) {
        lastIssues = attempt.issues;
        continue;
      }
      if (seen.has(attempt.name)) {
        lastIssues = [{ code: 'duplicate', message: `Duplicate name "${attempt.name}"` }];
        continue;
      }
      accepted = attempt;
      break;
    }

    if (!accepted && !last) {
      throw new Error(`Could not generate a "${category}" name`);
    }

    const chosen = accepted ?? last;
    let warnings = [];
    if (accepted) {
      warnings = chosen.issues;
    } else if (fatalIssues(last.issues).length === 0 && seen.has(last.name)) {
      warnings = [{ code: 'duplicate', message: `Exhausted unique names; repeated "${chosen.name}"` }];
    } else {
      warnings = [
        {
          code: 'relaxed',
          message: `Accepted "${chosen.name}" after ${MAX_ATTEMPTS} attempts without a clean validation`,
        },
        ...lastIssues,
      ];
    }

    seen.add(chosen.name);
    results.push(
      buildResult({
        attempt: chosen,
        category,
        poolId: chosen.poolId,
        rng,
        phonemeResolver,
        lapMap,
        warnings,
      }),
    );
  }

  return results;
}
