function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function resultsToText(results) {
  return results.map((result) => result.name).join('\n');
}

export function resultsToCsv(results) {
  const header = ['name', 'category', 'pool', 'seed', 'warnings', 'phonemes', 'provenance'];
  const rows = results.map((result) => [
    result.name,
    result.category,
    result.pool,
    result.seed,
    result.warnings.map((warning) => warning.code).join(' '),
    result.phonemes.map((phoneme) => phoneme.symbol).join(' '),
    JSON.stringify(result.provenance),
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export const IMPORT_TARGETS = [
  { id: 'person.given.male', label: 'Given names — male' },
  { id: 'person.given.female', label: 'Given names — female' },
  { id: 'person.given.neutral', label: 'Given names — neutral' },
  { id: 'person.clan', label: 'Clan or lineage names' },
  { id: 'lexicon.honorifics', label: 'Honorifics' },
  { id: 'lexicon.epithets', label: 'Epithets' },
  { id: 'lexicon.prefixes', label: 'Prefixes' },
  { id: 'lexicon.suffixes', label: 'Suffixes' },
  { id: 'lexicon.roots', label: 'Roots (root: gloss, gloss)' },
  { id: 'person.templates', label: 'Person templates' },
  { id: 'person.surnamePatterns', label: 'Surname patterns' },
  { id: 'place.templates', label: 'Place templates' },
  { id: 'organization.religious', label: 'Religious organization templates' },
  { id: 'organization.political', label: 'Political organization templates' },
  { id: 'organization.military', label: 'Military organization templates' },
  { id: 'organization.guild', label: 'Guild templates' },
  { id: 'domain.nation', label: 'Domain templates — nation' },
  { id: 'domain.kingdom', label: 'Domain templates — kingdom' },
  { id: 'domain.empire', label: 'Domain templates — empire' },
  { id: 'domain.province', label: 'Domain templates — province' },
  { id: 'domain.district', label: 'Domain templates — district' },
  { id: 'domain.town', label: 'Domain templates — town' },
];

function getPath(object, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);
}

function setPath(object, path, value) {
  const keys = path.split('.');
  let node = object;
  for (const key of keys.slice(0, -1)) {
    if (node[key] === undefined || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[keys.at(-1)] = value;
}

function stripQuotes(value) {
  const text = value.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replaceAll('""', '"');
  }
  return text;
}

function firstCell(line) {
  return stripQuotes(line.split(',')[0] ?? '');
}

function isHeader(line) {
  return /^(name|value|given|root)\s*([,:]|$)/i.test(line.trim());
}

function parseRootLine(line) {
  const separator = line.includes(':') ? ':' : ',';
  const index = line.indexOf(separator);
  const key = stripQuotes(index === -1 ? line : line.slice(0, index));
  const rest = index === -1 ? '' : line.slice(index + 1);
  const glosses = rest
    .split(/[,;]/)
    .map((gloss) => stripQuotes(gloss))
    .filter(Boolean);
  return { key, glosses };
}

export function importIntoDraft(draft, target, text) {
  if (!IMPORT_TARGETS.some((entry) => entry.id === target)) {
    throw new Error(`Unknown import target "${target}"`);
  }
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length > 0 && isHeader(lines[0])) lines.shift();

  if (target === 'lexicon.roots') {
    const roots = getPath(draft, 'lexicon.roots') ?? {};
    let added = 0;
    let skipped = 0;
    for (const line of lines) {
      const { key, glosses } = parseRootLine(line);
      if (!key) {
        skipped += 1;
        continue;
      }
      const value = glosses.length > 0 ? glosses : ['untranslated'];
      if (roots[key]) {
        roots[key] = [...new Set([...roots[key], ...value])];
      } else {
        roots[key] = value;
        added += 1;
      }
    }
    setPath(draft, 'lexicon.roots', roots);
    return { added, skipped, target };
  }

  const current = getPath(draft, target);
  const list = Array.isArray(current) ? current : [];
  const before = new Set(list);
  let added = 0;
  for (const line of lines) {
    const value = target.includes('templates') || target.includes('Patterns') ? line : firstCell(line);
    if (!value) continue;
    if (!before.has(value)) {
      list.push(value);
      before.add(value);
      added += 1;
    }
  }
  setPath(draft, target, list);
  return { added, skipped: 0, target };
}

export function summarizePreset(preset, packs) {
  const available = [];
  const missing = [];
  const versionMismatches = [];
  for (const entry of preset.laps) {
    const lap = packs.get(entry.id);
    if (!lap) {
      missing.push(entry.id);
      continue;
    }
    const pinned = preset.pins?.[entry.id];
    if (pinned !== undefined && pinned !== lap.version) {
      versionMismatches.push({ id: entry.id, expected: pinned, actual: lap.version });
    }
    available.push({ ...entry });
  }
  return { available, missing, versionMismatches };
}
