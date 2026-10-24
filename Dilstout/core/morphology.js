const DEFAULT_VOWELS = 'aeiouyàáâãäåāăąæèéêëēĕėęěɨìíîïīįıòóôõöøōŏőœùúûüūŭůűųýÿ';
const VOWEL_PATTERN = new RegExp(`[${DEFAULT_VOWELS}]`, 'iu');
const LETTER_PATTERN = /^\p{L}$/u;

function firstCharacter(text) {
  return text.length > 0 ? text[0] : '';
}

function lastCharacters(text, count) {
  return count > 0 ? text.slice(-count) : '';
}

function isVowel(character, rule) {
  if (!character) return false;
  const lower = character.toLowerCase();
  if (Array.isArray(rule?.vowels) && rule.vowels.length > 0) {
    return rule.vowels.map((vowel) => vowel.toLowerCase()).includes(lower);
  }
  return VOWEL_PATTERN.test(lower);
}

function startsWithVowel(text, rule) {
  return isVowel(firstCharacter(text), rule);
}

function endsWithVowel(text, rule) {
  return isVowel(text.slice(-1), rule);
}

function whenMatches(when, left, right, rule) {
  switch (when) {
    case 'beforeVowel':
      return startsWithVowel(right, rule);
    case 'beforeConsonant': {
      const character = firstCharacter(right);
      return LETTER_PATTERN.test(character) && !isVowel(character, rule);
    }
    case 'afterVowel':
      return endsWithVowel(left, rule);
    case 'afterConsonant': {
      const character = left.slice(-1);
      return LETTER_PATTERN.test(character) && !isVowel(character, rule);
    }
    case undefined:
    case 'always':
      return true;
    default:
      return false;
  }
}

export function applyJoinRule(left, right, rule) {
  if (!rule || !whenMatches(rule.when, left, right, rule)) {
    return { left, right };
  }

  switch (rule.type) {
    case 'dropDuplicate': {
      const a = left.slice(-1).toLowerCase();
      const b = firstCharacter(right).toLowerCase();
      if (a && a === b) return { left, right: right.slice(1) };
      return { left, right };
    }
    case 'elideVowel': {
      const from = rule.from ?? '';
      if (!from || !left.toLowerCase().endsWith(from.toLowerCase())) return { left, right };
      return { left: `${left.slice(0, -from.length)}${rule.to ?? ''}`, right };
    }
    case 'assimilate': {
      const from = rule.from ?? '';
      const before = Array.isArray(rule.before) ? rule.before.map((item) => item.toLowerCase()) : [];
      if (!from || !left.toLowerCase().endsWith(from.toLowerCase())) return { left, right };
      if (before.length > 0 && !before.includes(firstCharacter(right).toLowerCase())) return { left, right };
      return { left: `${left.slice(0, -from.length)}${rule.to ?? ''}`, right };
    }
    case 'replace': {
      const from = rule.from ?? '';
      if (!from || !left.toLowerCase().endsWith(from.toLowerCase())) return { left, right };
      return { left: `${left.slice(0, -from.length)}${rule.to ?? ''}`, right };
    }
    case 'insert': {
      return { left: `${left}${rule.to ?? ''}`, right };
    }
    default:
      return { left, right };
  }
}

export function joinMorphemes(left, right, rules = []) {
  let currentLeft = left;
  let currentRight = right;
  for (const rule of rules) {
    const result = applyJoinRule(currentLeft, currentRight, rule);
    currentLeft = result.left;
    currentRight = result.right;
  }
  return `${currentLeft}${currentRight}`;
}

export function joinSegments(segments, rules = []) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return { text: '', segments: [] };
  }
  const resultSegments = segments.map((segment) => ({ ...segment }));
  for (let index = 0; index < resultSegments.length - 1; index += 1) {
    const leftSegment = resultSegments[index];
    const rightSegment = resultSegments[index + 1];
    let left = leftSegment.value;
    let right = rightSegment.value;
    for (const rule of rules) {
      const applied = applyJoinRule(left, right, rule);
      left = applied.left;
      right = applied.right;
    }
    leftSegment.value = left;
    rightSegment.value = right;
  }
  return {
    text: resultSegments.map((segment) => segment.value).join(''),
    segments: resultSegments,
  };
}

export function titleCase(text) {
  return text
    .split(/([\s-]+)/u)
    .map((part) => {
      if (part.length === 0 || /^[\s-]+$/u.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}
