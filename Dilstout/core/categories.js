function poolsOf(templatesByKey) {
  return Object.entries(templatesByKey)
    .filter(([, templates]) => Array.isArray(templates) && templates.length > 0)
    .map(([id, templates]) => ({ id, templates }));
}

export const builtinCategories = [
  {
    id: 'person',
    label: 'Person',
    description: 'Given names, family names, clans, and honorifics.',
    genders: ['male', 'female', 'neutral'],
    pools: (lap) => [{ id: 'person', templates: lap.person.templates }].filter((pool) => pool.templates.length > 0),
  },
  {
    id: 'place',
    label: 'Location',
    description: 'Settlements, landmarks, and geographic features.',
    pools: (lap) => [{ id: 'place', templates: lap.place.templates }].filter((pool) => pool.templates.length > 0),
  },
  {
    id: 'organization',
    label: 'Organization',
    description: 'Religious, political, military, and guild organizations.',
    pools: (lap) => poolsOf(lap.organization),
  },
  {
    id: 'domain',
    label: 'Domain',
    description: 'Nations, kingdoms, empires, provinces, districts, and towns.',
    pools: (lap) => poolsOf(lap.domain),
  },
];
