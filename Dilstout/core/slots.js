function nonEmpty(value) {
  return Array.isArray(value) && value.length > 0;
}

function pick(list, rng) {
  return rng.pick(list);
}

function roots(lap) {
  return Object.keys(lap.lexicon.roots);
}

function givenPool(lap, gender) {
  const given = lap.person.given ?? {};
  const neutral = given.neutral ?? [];
  if (gender && nonEmpty(given[gender])) return [...given[gender], ...neutral];
  return [...(given.male ?? []), ...(given.female ?? []), ...neutral];
}

function orgKeys(lap) {
  return ['religious', 'political', 'military', 'guild'].filter((key) => nonEmpty(lap.organization[key]));
}

function domainKeys(lap) {
  return ['nation', 'kingdom', 'empire', 'province', 'district', 'town'].filter((key) =>
    nonEmpty(lap.domain[key]),
  );
}

export const builtinSlotResolvers = {
  root: {
    available: (lap) => roots(lap).length > 0,
    resolve: ({ lap, rng }) => {
      const value = pick(roots(lap), rng);
      const gloss = lap.lexicon.roots[value]?.[0];
      return gloss ? { value, gloss } : { value };
    },
  },
  given: {
    available: (lap) => givenPool(lap).length > 0,
    resolve: ({ lap, rng, context }) => ({ value: pick(givenPool(lap, context.gender), rng) }),
  },
  family: {
    available: (lap) => nonEmpty(lap.person.surnamePatterns),
    resolve: ({ lap, rng }) => ({ value: pick(lap.person.surnamePatterns, rng), template: true }),
  },
  clan: {
    available: (lap) => nonEmpty(lap.person.clan),
    resolve: ({ lap, rng }) => ({ value: pick(lap.person.clan, rng) }),
  },
  honorific: {
    available: (lap) => nonEmpty(lap.lexicon.honorifics),
    resolve: ({ lap, rng }) => ({ value: pick(lap.lexicon.honorifics, rng) }),
  },
  epithet: {
    available: (lap) => nonEmpty(lap.lexicon.epithets),
    resolve: ({ lap, rng }) => ({ value: pick(lap.lexicon.epithets, rng) }),
  },
  prefix: {
    available: (lap) => nonEmpty(lap.lexicon.prefixes),
    resolve: ({ lap, rng }) => ({ value: pick(lap.lexicon.prefixes, rng) }),
  },
  suffix: {
    available: (lap) => nonEmpty(lap.lexicon.suffixes),
    resolve: ({ lap, rng }) => ({ value: pick(lap.lexicon.suffixes, rng) }),
  },
  numeral: {
    available: (lap) => nonEmpty(lap.lexicon.numerals),
    resolve: ({ lap, rng }) => ({ value: pick(lap.lexicon.numerals, rng) }),
  },
  article: {
    available: (lap) => nonEmpty(lap.lexicon.articles),
    resolve: ({ lap, rng }) => ({ value: pick(lap.lexicon.articles, rng) }),
  },
  settlementType: {
    available: (lap) => nonEmpty(lap.place.settlementTypes),
    resolve: ({ lap, rng }) => ({ value: pick(lap.place.settlementTypes, rng) }),
  },
  settlementSuffix: {
    available: (lap) => nonEmpty(lap.place.settlementSuffixes),
    resolve: ({ lap, rng }) => ({ value: pick(lap.place.settlementSuffixes, rng) }),
  },
  terrain: {
    available: (lap) => nonEmpty(lap.place.terrainMorphemes),
    resolve: ({ lap, rng }) => ({ value: pick(lap.place.terrainMorphemes, rng) }),
  },
  directional: {
    available: (lap) => nonEmpty(lap.place.directionalAffixes),
    resolve: ({ lap, rng }) => ({ value: pick(lap.place.directionalAffixes, rng) }),
  },
  orgType: {
    available: (lap) => orgKeys(lap).length > 0,
    resolve: ({ lap, rng }) => ({ value: pick(orgKeys(lap), rng) }),
  },
  domainType: {
    available: (lap) => domainKeys(lap).length > 0,
    resolve: ({ lap, rng }) => ({ value: pick(domainKeys(lap), rng) }),
  },
};
