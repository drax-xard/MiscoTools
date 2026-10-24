# Dilstout Language Pack Research and Development Prompt

**How to use this prompt.** Start a fresh conversation with a capable AI assistant that has
web research or document-reading tools. Paste everything below the horizontal rule. Replace
`{{LANGUAGE_OR_CULTURE}}` with the target language or culture. Optionally replace the other
placeholders. If the assistant is running inside the Dilstout repository, it should write the
pack to `packs/<id>.lap`; otherwise it should return the complete file in its response.

```text
Required input:        {{LANGUAGE_OR_CULTURE}}
Optional scope:        {{SCOPE_OVERRIDES}}          (period, region, dialect, script)
Optional output notes: {{OUTPUT_LANGUAGE}}          (default: English)
Optional author:       {{AUTHOR}}                   (default: AI-assisted research draft)
Optional license:      {{LICENSE}}                  (default: see Licensing below)
```

---

# 1. Mission

You are a linguistic researcher and data modeller. Your job is to research one language or
culture and produce a single, complete, schema-valid Dilstout Language Pack (`.lap`) that
models that culture's **naming patterns**, not its fluent language.

A `.lap` is UTF-8 JSON. It drives a deterministic random name generator that combines
phonology, a glossed lexicon, and naming templates to produce person, place, organization,
and domain names. The pack must be usable **on its own** and must also mix safely with other
packs.

The only required input is the language or culture named above. Do not require the user to
supply sources, phonology, word lists, or templates. Research and assemble those yourself.
State your scope and assumptions, then proceed.

**Success means all of the following are true:**

1. Every non-obvious claim, name, root, and convention traces to a real, cited source.
2. The output is valid JSON that passes Dilstout's schema and validation rules.
3. All four name categories generate at least 100 unique names with zero validation warnings.
4. The pack is culturally respectful, correctly scoped, and honest about uncertainty.
5. A second person could audit the pack using your source ledger.

# 2. Inputs, defaults, and assumptions

- If the input names a **living language** without a period, default to the modern standard
  variety and say so.
- If the input names a **historical language** without a period, default to the best-attested
  classical/literary period and say so.
- If the input is a **pop-culture or broad label** rather than a language or culture (for
  example "Viking", "Celtic", "African", "Native American"), do not silently invent a pack.
  Either choose the most defensible specific language/culture and state the interpretation,
  or ask one concise question offering two or three concrete options. Prefer asking when the
  choice would radically change the data.
- If the input is a **modern nation** rather than a language/culture, identify the relevant
  language(s) and scope to one, or ask which one is intended.
- Do not conflate language, ethnicity, nationality, religion, and script. Name the precise
  language and variety in `meta.culture` and `meta.notes`.
- Default to romanized output for v1. Native script may be described in the research notes
  but must not appear in generated name material.
- If the user supplies scope overrides, follow them and record them in `meta.notes`.

Good scopes:

- `Old Norse (West Norse, c. 800-1200 CE)`
- `Yoruba (Southwest Nigeria, modern standard)`
- `Classical Nahuatl (16th-century Central Mexico)`
- `Ancient Greek (Attic, 5th-4th c. BCE)`

Bad scopes:

- `Viking`, `Celtic`, `African`, `Middle Eastern`, `the ancient world`
- A whole language family
- A fantasy culture presented as real

# 3. Absolute rules

1. **Never fabricate sources, citations, page numbers, DOIs, ISBNs, or URLs.** If you did not
   verify a source, do not cite it.
2. **Never invent linguistic data to fill a quota.** If the sources are thin, narrow the scope
   or reduce the pack. Do not pad with plausible-sounding fantasy forms.
3. **Never copy a proprietary name list or dictionary wholesale.** Extract patterns,
   representative examples, and glosses; cite the source; respect its license.
4. **Never include a living person's full name as a generated template**, and do not target
   real individuals.
5. **Never include names that the culture restricts to ritual or sacred use**, or that the
   community considers closed. If unsure, exclude and explain in `meta.notes`.
6. **Never caricature.** Do not use mock sounds, stereotypes, or "fantasy" phonology. Model
   the naming system, not a costume.
7. **Never add keys that are not in the schema.** Dilstout rejects unknown properties at every
   level.
8. **Never deliver a pack you know fails validation as if it were complete.** Fix it, or mark
   it `draft` and report the exact failures.
9. **Never claim fluency or cultural authority.** The pack models naming patterns. Say this
   in `meta.notes`.
10. **Do not use Wikipedia as a citation.** Use it only to find primary or scholarly sources.

# 4. Phase 1 - Define the scope

Write a short scope statement before collecting data:

- Language and variety (endonym and common English name)
- Period or Century / date range
- Region and speech community
- Script and the romanization/transliteration system you will use
- What the pack will and will not claim
- Any known restrictions, sensitivities, or closed practices

Use one consistent romanization system throughout. Name it in `meta.notes`. If sources use
different systems, normalize and record the conversion. Do not mix systems.

# 5. Phase 2 - Research and source ledger

## 5.1 Source hierarchy

Prefer, in order:

1. Peer-reviewed reference grammars, phonologies, and historical linguistics monographs.
2. Onomastic dictionaries, prosopographies, toponymic studies, and academic articles on
   personal or place names.
3. Primary corpora: inscriptions, administrative texts, chronicles, census records, and
   edited collections.
4. Official romanization standards and language academies.
5. Government statistical offices and national name registries, where their licenses permit
   reuse.
6. Reputable university, museum, and community-authored resources.
7. General encyclopedias as finding aids only; locate and cite the underlying source.

Use at least **five reliable sources**, including at least **two independent sources** for
phonology and naming conventions. For modern cultures, prefer sources produced or reviewed by
members of that speech community.

## 5.2 What to collect

- Phoneme inventory and allophonic notes
- Romanization or transliteration conventions
- Syllable structure, stress, tone, vowel length, and tempo
- Morphophonemic processes at morpheme boundaries
- Lexical roots and their glosses
- Given names, with gender usage where the culture has it, and attestations
- Family-name, clan, lineage, or patronymic conventions
- Place-name elements: settlement terms, terrain terms, directional affixes, suffixes
- Organization terms: religious, political, military, guild
- Domain terms: nation, kingdom, empire, province, district, town
- Naming order and address conventions
- Restrictions, sacred names, and practices that should not be generated

## 5.3 Mandatory source ledger

Maintain a ledger with one row per claim, entry, or group of entries. Every row must be
specific enough to audit.

| ID | Claim or data point | Value used | Full source citation | Locator | Confidence | Status |
|---|---|---|---|---|---|---|
| S1 | Example: word for "river" | `river-root` | Author, Year, *Title*, Publisher | p. 123 / entry `xyz` | high | attested |
| S2 | Example: female given name | `Name` | Author, Year, *Title*, Journal 12(3) | §4.2 / URL + access date | medium | attested |
| S3 | Example: settlement suffix | `-suffix` | Author, Year, *Title* | table 2, p. 45 | high | attested |
| S4 | Example: join rule | final-vowel elision | Author, Year, *Grammar* | §3.4.1 | high | attested |

Status values:

- `attested` - directly supported by the cited source.
- `derived` - produced by applying a sourced pattern; explain the derivation.
- `inferred` - a reasoned extrapolation; state why and keep it rare.
- `excluded` - considered but deliberately omitted for ethical or evidentiary reasons.

Confidence values: `high`, `medium`, `low`. Low-confidence entries must be flagged in
`meta.notes` and must not be the sole basis for a central claim.

If you cannot fill a row honestly, remove the datum or move it to the exclusions list.

# 6. Phase 3 - Encode the data

Build the pack in the following order. Keep all generated-name material in lowercase; the
renderer title-cases the final output.

1. **Scope and metadata.** Set `meta.id`, `meta.name`, `meta.culture`, `meta.era`,
   `meta.author`, `meta.license`, `meta.sources`, `meta.notes`, `meta.status`.
2. **Phonology.** Inventory, romanization, phonotactics, prosody, and join rules.
3. **Lexicon.** Roots with glosses, then affixes, epithets, honorifics, numerals, articles.
4. **Person.** Given names, order, clan/patronymic conventions, surname patterns, templates.
5. **Place.** Settlement types, suffixes, terrain morphemes, directional affixes, templates.
6. **Organization.** Only subtypes the culture attests; each with templates.
7. **Domain.** Only subtypes the culture attests; each with templates.
8. **Weights and voice.** Include safe defaults.
9. **Validation.** Run the checks in section 10.

# 7. Full `.lap` data specification

The authoritative schema is `schemas/lap.schema.json`. If you have repository access, read it.
The following specification is complete for authoring; unknown properties are rejected at
every level.

## 7.1 Top level

```json
{
  "format": "dilstout.lap",
  "version": 1,
  "meta": {},
  "phonology": {},
  "lexicon": {},
  "person": {},
  "place": {},
  "organization": {},
  "domain": {},
  "weights": {},
  "voice": {}
}
```

Required: `format`, `version`, `meta`, `phonology`, `lexicon`, `person`, `place`,
`organization`, `domain`.

- `format` must be exactly `dilstout.lap`.
- `version` must be the integer `1`.
- `weights` and `voice` are optional in the schema but should be included with defaults.

## 7.2 `meta`

Required: `id`, `name`.

- `id`: lowercase letters, digits, and hyphens; must match `^[a-z0-9][a-z0-9-]*$`; stable.
- `name`: human-readable label, for example `Old Norse (West Norse)`.
- `culture`: specific culture or language, not a continent or family.
- `era`: dates or period label.
- `author`: use the user-supplied value or `AI-assisted research draft (unreviewed)`.
- `license`: license of the original compilation plus a note that cited sources retain their
  rights. Do not assert a license you cannot justify.
- `sources`: array of full citations or stable URLs. Provide at least five.
- `notes`: scope, dialect, period, romanization system, exclusions, caveats, review status,
  and the sentence "Models naming patterns, not fluent language."
- `status`: `experimental`, `draft`, or `stable`. Use `experimental` unless a qualified
  reviewer has checked the pack. Use `draft` if anything important is incomplete.

## 7.3 `phonology`

Required: `inventory`, `romanization`, `prosody`.

### `phonology.inventory`

Array of phoneme objects. Minimum one; target 15-40.

Each entry:

- `symbol` (required): IPA symbol, for example `ʃ`, `kʷ`, `aː`.
- `type` (required): `consonant` or `vowel`.
- Consonants may include `place`, `manner`, `voicing` (`voiced` or `voiceless`), `notes`.
- Vowels may include `height`, `backness`, `rounded` (boolean), `length`
  (`short`, `long`, `half-long`), `notes`.

Only include features the sources support. Omit a feature rather than guess. Every value in
`romanization` should correspond to an inventory symbol.

### `phonology.romanization`

Object mapping grapheme to IPA, for example:

```json
{ "sh": "ʃ", "kh": "x", "a": "a", "ā": "aː" }
```

- Keys must be lowercase.
- Longest match wins, so digraphs and trigraphs are fine.
- Include **every** base grapheme and every multi-character grapheme used anywhere in the
  pack: roots, affixes, names, template literals, everything.
- Values should exactly match inventory symbols (case-insensitive).
- Use one transliteration system consistently and name it in `meta.notes`.

### `phonology.phonotactics` (recommended)

- `onsets`, `nuclei`, `codas`: arrays of IPA symbols or clusters.
- `notes`: what is and is not enforced.

These arrays document the language; v1 does not enforce a full syllabifier.

### `phonology.prosody`

Required: `stress`, `syllableTemplate`, `tempo`.

- `stress`: string such as `initial`, `penultimate`, `final`, `none`, or `null`.
- `syllableTemplate`: string such as `(C)V(C)` or `CVC`.
- `tempo`: number from 0.1 to 4. Use `1` unless the source gives a reason.
- `vowelLengthDistinctive`: boolean.
- `tone`: string or `null`. Describe the tone system if present.

### `phonology.joinRules`

Optional array. Include only processes you can source. If no reliable process is documented,
omit the array or use only an orthographic convention that you label as such.

Each rule has a required `type` and optional `from`, `to`, `when`, `before`, `vowels`.

| Type | Effect |
|---|---|
| `dropDuplicate` | If the last character of the left segment equals the first character of the right segment (case-insensitive), remove the first character of the right segment. |
| `elideVowel` | If the left segment ends with `from`, replace that ending with `to` (usually `""`). |
| `assimilate` | If the left segment ends with `from` and the right segment starts with one of `before` (or `before` is empty), replace the ending with `to`. |
| `replace` | If the left segment ends with `from`, replace that ending with `to`. |
| `insert` | Append `to` to the left segment. |

`when` may be `beforeVowel`, `beforeConsonant`, `afterVowel`, `afterConsonant`, or `always`
(the default). Rules run in array order at every morpheme boundary, and each rule sees the
current left and right strings.

**Vowel detection warning:** the engine's default vowel set is Latin-script oriented. If your
romanization uses non-ASCII vowel graphemes (for example `ə`, `ɛ`, `ɔ`, `ɨ`) or unusual vowel
letters, set an explicit `vowels` array on every rule that uses a vowel condition. Otherwise
conditions such as `beforeVowel` may silently misclassify your segments.

Prefer few, well-sourced rules. Do not add a rule just to fix one awkward pair; redesign the
morphemes or templates instead. If a collision-avoidance rule is purely orthographic, say so
in `meta.notes`.

## 7.4 `lexicon`

Required: `roots`, `prefixes`, `suffixes`, `epithets`, `honorifics`. Include all five even if
some are empty arrays.

- `roots`: object mapping a surface root to an array of at least one English gloss.
  Example: `"river": ["river", "flowing water"]`. Every root must have a gloss. Aim for
  20-40 roots; 15 is the minimum for a viable pack.
- `prefixes`, `suffixes`: arrays of bound morphemes used in templates.
- `epithets`: arrays of full words or short phrases.
- `honorifics`: arrays of titles or address forms.
- `numerals`, `articles`: optional arrays.

Do not include a root you cannot gloss. Do not include an affix that never appears in a
template. Do not put IPA brackets, slashes, commas, or explanatory text inside the surface
forms.

## 7.5 `person`

Required: `given`, `templates`.

- `given`: object with optional `male`, `female`, `neutral` arrays. Split by gender only if
  the culture supports that split. If it does not, put every name in `neutral` and set
  `gendered` to `false`.
- `templates`: at least one template for a person's full name.
- `surnamePatterns`: templates for family names, not a flat list. Used by the `{family}` slot.
- `order`: one of `given-family`, `family-given`, `given-only`, `given-clan`.
- `clan`: optional array of clan or lineage names.
- `patronymic`: optional string describing the convention, or `null`. There is no
  `{patronymic}` slot in v1; leave the mechanics to a later feature.
- `gendered`: boolean. Set `false` if the culture does not gender given names.

Do not invent a surname system where none exists. Use `given-only` or `given-clan` and omit
`{family}` from templates if there is no family-name pattern.

## 7.6 `place`

Required: `templates`.

- `templates`: at least one template for settlements, landmarks, or geographic features.
- `settlementTypes`: words for settlement types, for example `city`, `fort`, `harbor`.
- `settlementSuffixes`: toponymic suffixes.
- `terrainMorphemes`: terrain or feature words.
- `directionalAffixes`: directional elements.

Only include morphemes the sources attest or that follow a sourced pattern.

## 7.7 `organization`

Object with optional keys `religious`, `political`, `military`, `guild`. Each value is an
array of templates. Omit a key or leave it empty if the culture does not attest that subtype.
An empty object is schema-valid but makes the organization category unusable; for a complete
pack, provide at least one attested subtype, ideally all four where appropriate.

## 7.8 `domain`

Object with optional keys `nation`, `kingdom`, `empire`, `province`, `district`, `town`.
Each value is an array of templates. As with organization, provide at least one attested
subtype for a complete pack.

## 7.9 `weights` (recommended)

```json
{
  "componentWeights": { "root": 1, "given": 1, "prefix": 1, "suffix": 1 },
  "categoryBias": { "person": 1, "place": 1, "organization": 1, "domain": 1 }
}
```

All values must be numbers greater than or equal to zero.

## 7.10 `voice` (recommended)

```json
{ "preferredSpeaker": "formant", "basePitch": 110, "rate": 1 }
```

- `basePitch`: number from 40 to 400.
- `rate`: number from 0.1 to 4.

# 8. Template grammar and the slot contract

Templates are strings containing literal text and `{slot}` placeholders, for example:

```text
"{root}{settlementSuffix}"
"{honorific} {given} of {clan}"
"{directional}-{root}"
```

The v1 slots are:

| Slot | Resolves to | Available when |
|---|---|---|
| `root` | A random key from `lexicon.roots`; its first gloss is recorded as provenance. | `roots` is non-empty. |
| `given` | A random given name, filtered by the current gender context. | Any `person.given` pool is non-empty. |
| `family` | A random entry from `person.surnamePatterns`, then expanded recursively. | `surnamePatterns` is non-empty. |
| `clan` | A random entry from `person.clan`. | `clan` is non-empty. |
| `honorific` | A random entry from `lexicon.honorifics`. | `honorifics` is non-empty. |
| `epithet` | A random entry from `lexicon.epithets`. | `epithets` is non-empty. |
| `prefix` | A random entry from `lexicon.prefixes`. | `prefixes` is non-empty. |
| `suffix` | A random entry from `lexicon.suffixes`. | `suffixes` is non-empty. |
| `numeral` | A random entry from `lexicon.numerals`. | `numerals` is non-empty. |
| `article` | A random entry from `lexicon.articles`. | `articles` is non-empty. |
| `settlementType` | A random entry from `place.settlementTypes`. | `settlementTypes` is non-empty. |
| `settlementSuffix` | A random entry from `place.settlementSuffixes`. | `settlementSuffixes` is non-empty. |
| `terrain` | A random entry from `place.terrainMorphemes`. | `terrainMorphemes` is non-empty. |
| `directional` | A random entry from `place.directionalAffixes`. | `directionalAffixes` is non-empty. |
| `orgType` | The name of a non-empty organization key (`religious`, `political`, `military`, `guild`). | Any organization subtype is non-empty. |
| `domainType` | The name of a non-empty domain key (`nation`, `kingdom`, `empire`, `province`, `district`, `town`). | Any domain subtype is non-empty. |

**Critical slot rules:**

1. Unknown slots are errors. Never invent a slot such as `{patronymic}` or `{adjective}`.
2. Every slot used anywhere in the pack must be resolvable by the same pack, even when that
   pack is loaded alone. Do not use `{family}` unless `surnamePatterns` is non-empty. Do not
   use `{terrain}` unless `terrainMorphemes` is non-empty. Do not use `{honorific}` unless
   `honorifics` is non-empty. And so on.
3. `orgType` and `domainType` return the English key name, not a native word. Avoid using
   them in user-facing templates unless you deliberately want English category labels. Prefer
   literal native terms from the lexicon, and make sure those literal characters are covered
   by `romanization`.
4. Template expansion has a maximum depth of four. Keep recursion through
   `surnamePatterns` shallow and non-cyclic.
5. Every literal character in a template is validated against the pack's symbols. Connectives
   such as "of", "the", or "son of" must be in the target language and covered by
   `romanization`; otherwise omit them or use a hyphen/space structure.
6. Only these characters may appear in final names: Unicode letters, combining marks, ASCII
   or curly apostrophes, periods, hyphens, and spaces. Do not use digits, commas, colons,
   slashes, parentheses, ampersands, underscores, or question marks. **Use the ASCII
   apostrophe `'` in pack data.** The character pattern accepts the curly apostrophe, but the
   symbol tokenizer skips only the ASCII apostrophe, so a curly apostrophe produces an
   `unknown-symbol` warning.
7. The renderer title-cases each space- or hyphen-separated part. It lowercases the rest of
   each part, so do not rely on internal capitalization. Apostrophes do not start a new part;
   `o'brien` becomes `O'brien`.
8. Keep generated names between 2 and 48 characters. Avoid templates that can collapse to a
   single character.

# 9. Validation contract

Dilstout validates a pack when it loads it and validates each generated name.

## 9.1 Pack validation

`loadLap` enforces `schemas/lap.schema.json`:

- Required top-level keys and nested keys are present.
- No unknown properties at any level.
- Enumerations are respected.
- String patterns and numeric ranges are respected.
- Arrays meet minimum lengths.

A pack with an extra key, a misspelled field, or a wrong type will not load.

## 9.2 Name validation

For every generated name, the engine checks:

- The name is not empty.
- It contains no unresolved `{` or `}`.
- Its length is between 2 and 48 characters.
- It matches `^[\p{L}\p{M}'’.\- ]+$`.
- Every character is covered by the pack's symbols.

Symbol coverage works by lowercasing the name, skipping spaces, hyphens, the ASCII
apostrophe `'`, and periods, and greedily matching the longest symbol from the union of the
pack's `romanization` keys and `inventory` symbols. A curly apostrophe is not skipped. Any
unmatched token produces an `unknown-symbol` warning.

`unknown-symbol` is a warning, not a fatal error, but the quality target is **zero warnings**
for the validation batch. Treat every warning as a defect and fix the data.

## 9.3 Warning-free target

For each of the four categories, generate 100 names from the pack alone. Every name must be
unique and every result must have an empty `warnings` array. If the engine cannot produce 100
unique names without warnings, the pack is under-resourced or contains invalid symbols.

# 10. Coverage, uniqueness, and quality targets

These are targets, not quotas. Never pad with invented data.

- `lexicon.roots`: 20-40 glossed roots (minimum 15).
- `person.given`: 15-30 attested or derived names across the pools; if gendered, populate
  each pool the culture uses.
- `person.surnamePatterns`: 4-8 patterns if the culture uses family names.
- `place.settlementSuffixes`: 6-12.
- `place.terrainMorphemes`: 8-15.
- `place.directionalAffixes`: 2-8.
- `phonology.inventory`: 15-40 phonemes.
- At least 3 person templates, 3 place templates, 2 templates per organization subtype, and
  2 templates per domain subtype.

**Combinatorial headroom.** The engine deduplicates within a batch and retries up to 60 times.
If the space of possible names is too small, it repeats names and emits warnings. Estimate the
number of distinct outputs per category from the template and pool sizes. Aim for at least
1,000 possible outputs per category, and at least 10 times the 100-name validation batch. For
organization and domain, the total across non-empty subtypes counts, but each subtype should
still have enough combinations to avoid immediate repetition.

If a subtype is too small, either enrich it from sources or remove it. Empty subtype arrays
are skipped by the mixer, but a completely empty category cannot generate.

# 11. Ethics, licensing, and cultural review

- **Closed practices.** Some names, invocations, and ritual terms are not appropriate to
  generate. Exclude them and explain why in `meta.notes`.
- **Living people.** Do not make a living person's full name a template or a target.
- **Sacred names.** Do not use names reserved for ritual or deity-only use as ordinary
  personal names unless the culture demonstrably does so.
- **No costume linguistics.** Do not caricature sounds or mix unrelated cultures to make the
  pack "feel" exotic.
- **Gender systems.** Do not impose a binary split the culture does not have. Use `neutral`
  and `gendered: false` when appropriate.
- **Naming systems.** Do not invent surnames, clans, or patronymics where none are attested.
- **Endonyms and exonyms.** Prefer respectful, current terminology. Avoid colonial labels
  unless needed for discoverability; explain the choice in `meta.notes`.
- **Provenance.** Every root, name, affix, and convention should trace to the ledger or be
  explicitly labelled as a derivation.
- **Licensing.** Do not bulk-copy a copyrighted dictionary or proprietary name database.
  Summarize patterns, use representative examples, and cite. Check the license of every data
  source, including government name statistics. If redistribution rights are unclear, do not
  include the data.
- **Review.** A pack about a culture you do not belong to should be reviewed by someone who
  does, where possible. Record whether that review happened. Until then, status is
  `experimental`.

# 12. Deliverable format

Return a Markdown report with exactly these sections. Do not omit sections; write "none" or
"not available" where necessary.

```markdown
## 1. Scope and assumptions
A short paragraph naming the language, variety, period, region, romanization system, and
what the pack does not claim.

## 2. Source ledger
The table from section 5.3, complete and auditable. Include a research date and access dates
for URLs.

## 3. Design notes
How the phonology, morphology, naming order, gender system, and category templates were
chosen. Note conflicts between sources and how you resolved them. Note exclusions.

## 4. Language pack
A single fenced `json` block containing the complete `.lap` file. Valid JSON only: no
comments, no trailing commas, no placeholders, no extra keys.

## 5. Validation report
The exact commands you ran and their output, or a manual checklist with results. State the
number of unique names and warnings per category.

## 6. Limitations and review notes
What is uncertain, what is inferred, what was excluded, and what a specialist should review.
```

If the harness can write files, write the pack to `packs/<id>.lap` and keep the report in the
conversation or in a separate Markdown file if asked. Do not modify the engine, schema, or
existing packs.

# 13. Self-validation procedure

If you are inside the Dilstout repository and Node 22.14+ is available, run a check equivalent
to the following. Replace `PACK_ID` with the new pack's `meta.id`.

```js
import { readFileSync } from 'node:fs';
import { loadLap } from './core/lap.js';
import { generate } from './core/engine.js';
import { checkPhonotactics } from './core/validate.js';
import { parseTemplate } from './core/engine.js';

const id = 'PACK_ID';
const lap = loadLap(readFileSync(`packs/${id}.lap`, 'utf8'));

function collectStrings(lap) {
  const values = [
    ...Object.keys(lap.lexicon.roots),
    ...lap.lexicon.prefixes,
    ...lap.lexicon.suffixes,
    ...lap.lexicon.epithets,
    ...lap.lexicon.honorifics,
    ...lap.lexicon.numerals,
    ...lap.lexicon.articles,
    ...lap.person.given.male,
    ...lap.person.given.female,
    ...lap.person.given.neutral,
    ...lap.person.clan,
    ...lap.place.settlementTypes,
    ...lap.place.settlementSuffixes,
    ...lap.place.terrainMorphemes,
    ...lap.place.directionalAffixes,
  ];
  const templates = [
    ...lap.person.templates,
    ...lap.person.surnamePatterns,
    ...lap.place.templates,
    ...Object.values(lap.organization).flat(),
    ...Object.values(lap.domain).flat(),
  ];
  for (const template of templates) {
    for (const token of parseTemplate(template)) {
      if (token.type === 'literal') values.push(token.value);
    }
  }
  return values;
}

const bad = [];
for (const value of collectStrings(lap)) {
  const unknown = checkPhonotactics(value, lap);
  if (unknown.length > 0) bad.push(`${value}: ${[...new Set(unknown)].join(',')}`);
}
console.log('unknown symbols in data:', bad.length ? bad : 'none');

for (const category of ['person', 'place', 'organization', 'domain']) {
  const results = generate({ laps: [lap], category, count: 100, seed: 'lap-review' });
  const names = results.map((result) => result.name);
  const warned = results.filter((result) => result.warnings.length > 0);
  console.log(category, {
    unique: new Set(names).size,
    warnings: warned.length,
    examples: names.slice(0, 8),
  });
}
```

If the repository is not available, perform the same checks manually:

- Validate the JSON syntax and the schema rules in section 7.
- Verify that every string is covered by the romanization table or inventory.
- Verify that every template slot is resolvable by the pack alone.
- Verify that all four categories have templates and non-empty pools.
- Estimate the number of distinct names per category and confirm it comfortably exceeds 100.
- Generate a sample mentally or with the harness and inspect for readability, length, and
  duplicates.

Do not skip this step. Report the actual results.

# 14. Handling uncertainty and failure

- **No web access or no usable sources.** Do not fabricate citations. Say clearly that
  retrieval is unavailable, then either (a) ask for permission to produce a clearly labelled
  unverified draft, or (b) provide a research plan and the exact sources needed. An unverified
  draft must use `meta.status: "draft"` and must not claim to be sourced.
- **Conflicting sources.** Prefer the more recent peer-reviewed reference grammar or the more
  specific onomastic study. Record the conflict and your choice in the ledger and design
  notes.
- **Sparse data.** Narrow the scope further. A smaller, well-sourced pack is better than a
  broad, invented one.
- **A category has no attested data.** Leave the subtype empty or omit it. Do not invent
  templates. If an entire category has no data, explain why and mark the pack `draft`.
- **Ethical concern.** Exclude the sensitive data and document the exclusion. If the whole
  request is inappropriate, explain and offer a respectful alternative.
- **Validation failure.** Fix the data and re-run. If the failure is caused by the engine or
  schema rather than the pack, report it precisely. Never hide a failure.

# 15. Definition of done

Before you answer, confirm every item:

- [ ] Scope is specific, one language/variety, with period and region.
- [ ] At least five reliable sources are cited; core claims have two independent sources.
- [ ] Source ledger is complete; no fabricated citations or locators.
- [ ] The `.lap` is valid JSON with `format: "dilstout.lap"` and `version: 1`.
- [ ] All required top-level and nested keys are present; no unknown keys anywhere.
- [ ] `meta.id` matches the required pattern and the filename.
- [ ] `meta.sources` has at least five entries; `meta.license` and `meta.notes` are complete.
- [ ] `meta.status` is `experimental` or `draft`, not `stable`.
- [ ] Phoneme inventory has at least 15 entries with accurate features.
- [ ] Romanization covers every grapheme used in every string.
- [ ] Prosody is filled from sources, including stress, syllable template, and tempo.
- [ ] Join rules are minimal, sourced, and correctly ordered; no rule is a one-off hack.
- [ ] Every root has at least one gloss; no unglossed roots.
- [ ] Given names, surname patterns, and place morphemes meet the coverage targets.
- [ ] Person, place, organization, and domain each have templates and non-empty pools.
- [ ] Every template slot is resolvable by the pack alone.
- [ ] No template uses an unknown slot or an English connective not covered by romanization.
- [ ] Only allowed characters appear in name material; no digits or unsupported punctuation.
- [ ] At least 100 unique, warning-free names are possible in each category.
- [ ] No living person's full name, restricted sacred name, or stereotype is included.
- [ ] Exclusions and uncertainty are documented in `meta.notes` and the report.
- [ ] The validation report contains actual results, not assumptions.
- [ ] The final JSON block is complete and can be saved directly as `packs/<id>.lap`.
```

---

# Notes for the human operator

- The prompt assumes the assistant can read the Dilstout schema. If it cannot, the
  specification in section 7 is sufficient.
- If you want a stricter or looser output, adjust the coverage targets, but do not weaken the
  no-fabrication, ethics, or validation rules.
- The source-ledger requirement is what turns the output from a plausible word list into an
  auditable pack. Keep it even if the final `.lap` is all you plan to ship.
- If the assistant produces a pack without a ledger or without validation output, treat it as
  incomplete and ask it to finish sections 2, 5, and 6 of the deliverable.
