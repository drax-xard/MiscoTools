import { assertValid, validateLap } from './schema.js';

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function parseLap(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse .lap JSON: ${error.message}`);
  }
}

export function migrateLap(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid .lap: expected a JSON object');
  }
  if (raw.version === undefined) {
    throw new Error('Invalid .lap: missing "version"');
  }
  if (raw.version > 1) {
    throw new Error(`Unsupported .lap version ${raw.version}; this build supports version 1`);
  }
  return raw;
}

function defaults(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

export function normalizeLap(raw) {
  const lap = clone(raw);

  lap.weights = defaults(lap.weights, {});
  lap.weights.componentWeights = defaults(lap.weights.componentWeights, {});
  lap.weights.categoryBias = defaults(lap.weights.categoryBias, {});

  lap.phonology.phonotactics = defaults(lap.phonology.phonotactics, {});
  lap.phonology.phonotactics.onsets = defaults(lap.phonology.phonotactics.onsets, []);
  lap.phonology.phonotactics.nuclei = defaults(lap.phonology.phonotactics.nuclei, []);
  lap.phonology.phonotactics.codas = defaults(lap.phonology.phonotactics.codas, []);
  lap.phonology.joinRules = defaults(lap.phonology.joinRules, []);
  lap.phonology.prosody.vowelLengthDistinctive = defaults(lap.phonology.prosody.vowelLengthDistinctive, false);
  lap.phonology.prosody.tone = defaults(lap.phonology.prosody.tone, null);

  lap.lexicon.prefixes = defaults(lap.lexicon.prefixes, []);
  lap.lexicon.suffixes = defaults(lap.lexicon.suffixes, []);
  lap.lexicon.epithets = defaults(lap.lexicon.epithets, []);
  lap.lexicon.honorifics = defaults(lap.lexicon.honorifics, []);
  lap.lexicon.numerals = defaults(lap.lexicon.numerals, []);
  lap.lexicon.articles = defaults(lap.lexicon.articles, []);

  lap.person.given = defaults(lap.person.given, {});
  lap.person.given.male = defaults(lap.person.given.male, []);
  lap.person.given.female = defaults(lap.person.given.female, []);
  lap.person.given.neutral = defaults(lap.person.given.neutral, []);
  lap.person.surnamePatterns = defaults(lap.person.surnamePatterns, []);
  lap.person.clan = defaults(lap.person.clan, []);
  lap.person.order = defaults(lap.person.order, 'given-family');
  lap.person.gendered = defaults(lap.person.gendered, true);
  lap.person.patronymic = defaults(lap.person.patronymic, null);

  lap.place.settlementTypes = defaults(lap.place.settlementTypes, []);
  lap.place.settlementSuffixes = defaults(lap.place.settlementSuffixes, []);
  lap.place.terrainMorphemes = defaults(lap.place.terrainMorphemes, []);
  lap.place.directionalAffixes = defaults(lap.place.directionalAffixes, []);

  for (const key of ['religious', 'political', 'military', 'guild']) {
    lap.organization[key] = defaults(lap.organization[key], []);
  }

  for (const key of ['nation', 'kingdom', 'empire', 'province', 'district', 'town']) {
    lap.domain[key] = defaults(lap.domain[key], []);
  }

  lap.voice = defaults(lap.voice, {});
  lap.voice.preferredSpeaker = defaults(lap.voice.preferredSpeaker, 'formant');
  lap.voice.basePitch = defaults(lap.voice.basePitch, 110);
  lap.voice.rate = defaults(lap.voice.rate, 1);

  return lap;
}

export function loadLap(input) {
  const raw = typeof input === 'string' ? parseLap(input) : clone(input);
  const migrated = migrateLap(raw);
  assertValid(validateLap(migrated), 'Invalid .lap');
  return normalizeLap(migrated);
}

export function lapId(lap) {
  return lap.meta.id;
}
