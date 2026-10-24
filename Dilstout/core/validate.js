const ALLOWED_PATTERN = /^[\p{L}\p{M}'’.\- ]+$/u;

export function symbolInventory(lap) {
  const symbols = new Set();
  for (const key of Object.keys(lap.phonology.romanization ?? {})) {
    if (key.length > 0) symbols.add(key.toLowerCase());
  }
  for (const phoneme of lap.phonology.inventory) {
    if (phoneme.symbol) symbols.add(phoneme.symbol.toLowerCase());
  }
  return [...symbols].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function tokenizeWithSymbols(text, symbols) {
  const source = text.toLowerCase();
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/[\s\-'.]/u.test(character)) {
      index += 1;
      continue;
    }
    const match = symbols.find((symbol) => source.startsWith(symbol, index));
    if (match) {
      tokens.push(match);
      index += match.length;
    } else {
      tokens.push(character);
      index += 1;
    }
  }
  return tokens;
}

export function checkPhonotactics(name, laps) {
  const list = Array.isArray(laps) ? laps : [laps];
  const symbols = [...new Set(list.flatMap((lap) => symbolInventory(lap)))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
  const tokens = tokenizeWithSymbols(name, symbols);
  const known = new Set(symbols);
  return tokens.filter((token) => !known.has(token));
}

export function validateName(name, { lap, laps, minLength = 2, maxLength = 48 } = {}) {
  const issues = [];
  if (typeof name !== 'string' || name.trim().length === 0) {
    issues.push({ code: 'empty', message: 'Name is empty' });
    return { ok: false, issues };
  }
  if (name.includes('{') || name.includes('}')) {
    issues.push({ code: 'placeholder', message: `Unresolved template slot in "${name}"` });
  }
  if (name.length < minLength) {
    issues.push({ code: 'too-short', message: `"${name}" is shorter than ${minLength} characters` });
  }
  if (name.length > maxLength) {
    issues.push({ code: 'too-long', message: `"${name}" is longer than ${maxLength} characters` });
  }
  if (!ALLOWED_PATTERN.test(name)) {
    issues.push({ code: 'invalid-character', message: `"${name}" contains unsupported characters` });
  }
  const packList = laps ?? (lap ? [lap] : []);
  if (packList.length > 0) {
    const unknown = checkPhonotactics(name, packList);
    if (unknown.length > 0) {
      issues.push({
        code: 'unknown-symbol',
        message: `"${name}" uses symbols outside the pack inventory: ${[...new Set(unknown)].join(', ')}`,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

const FATAL_CODES = new Set(['empty', 'placeholder', 'too-short', 'too-long', 'invalid-character']);

export function fatalIssues(issues) {
  return issues.filter((issue) => FATAL_CODES.has(issue.code));
}

export function relaxIssues(issues) {
  return issues.map((issue) => ({ ...issue, relaxed: true }));
}
