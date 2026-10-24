# Language Pack Authoring Guide

A Language Pack (`.lap`) describes one language or culture's naming system. This guide covers
what to collect, how to encode it, and how to keep the result honest.

## Before you start

1. **Pick a scope.** "Ancient Babylonian" is a scope; "the ancient world" is not. Narrow packs
   mix better and are easier to source.
2. **Collect sources first.** Prefer grammars, onomastic dictionaries, and academic articles.
   Wikipedia is a starting point, not a citation.
3. **Write down the convention you are using.** Which period? Which dialect? Which
   transliteration system? Put this in `meta.notes`.
4. **Decide what you will not claim.** Packs model naming *patterns*, not fluent language.
   Say so in `meta.notes`.

## Minimum viable pack

A pack validates with `format`, `version`, `meta`, `phonology`, `lexicon`, `person`, `place`,
`organization`, and `domain`. Start with:

- 15–30 roots with glosses, 8–20 given names, 3–6 surname patterns, 5–10 place morphemes.
- One or two templates per category.
- At least one join rule if morphemes collide at boundaries.

## Fields

### `meta`

| Field | Guidance |
|---|---|
| `id` | Lowercase, hyphenated, stable. Used by presets, so never rename casually. |
| `name` | Human label shown in the mixer. |
| `culture` | The specific culture or language. |
| `era` | Dates or period label. |
| `author`, `license` | Required before publishing a pack. |
| `sources` | Full citations or URLs you actually used. |
| `notes` | Scope, dialect, transliteration choices, caveats. |
| `status` | `experimental`, `draft`, or `stable`. |

### `phonology.inventory`

The phoneme inventory drives validation, provenance, and later audio. Each entry needs
`symbol` (IPA) and `type` (`consonant` or `vowel`), plus whatever features you can support:

- Consonants: `place`, `manner`, `voicing`.
- Vowels: `height`, `backness`, `rounded`, `length`.

Only include phonemes your sources support. Empty or guessed features are worse than omitted
ones, because future speech synthesis will read them literally.

### `phonology.romanization`

A grapheme-to-IPA table. Longest match wins, so digraphs are fine:

```json
{ "sh": "ʃ", "kh": "x", "a": "a", "ā": "aː" }
```

Use one transliteration system consistently. Put the system's name in `meta.notes`.

### `phonology.prosody`

`stress`, `syllableTemplate`, `tempo`, `vowelLengthDistinctive`, and `tone` describe how the
language sounds. These fields are not used by v1 generation but are read by the future voice
milestone, so fill them from sources rather than intuition.

### `phonology.joinRules`

Rules run in order at every morpheme boundary:

| Type | Use |
|---|---|
| `dropDuplicate` | Remove a doubled boundary letter. |
| `elideVowel` | Drop or change a final vowel before a vowel. |
| `assimilate` | Change a coda before listed onsets (`before: ["b","p"]`). |
| `replace` | Swap a boundary ending for another. |
| `insert` | Add epenthetic material. |

Conditions: `beforeVowel`, `beforeConsonant`, `afterVowel`, `afterConsonant`, `always`.
Keep rules minimal; over-engineering morphology makes generated names mushy.

### `lexicon`

- `roots`: object mapping a root to glosses. Roots are the workhorse of most templates.
- `prefixes`, `suffixes`: bound morphemes used in templates.
- `epithets`, `honorifics`: full words or short phrases.
- `numerals`, `articles`: optional.

Do not include a root you cannot gloss. The gloss is what makes provenance explainable.

### `person`

- `given`: split into `male`, `female`, `neutral` only where the culture supports that split.
  If it does not, put everything in `neutral` and set `gendered: false`.
- `surnamePatterns`: templates, not flat names. `"{root}{suffix}"` is typical.
- `order`: `given-family`, `family-given`, `given-only`, or `given-clan`.
- `clan`: optional clan or lineage names.
- `patronymic`: note the pattern if one exists, but leave the mechanics to a future feature.
- `templates`: the top-level patterns for a person's full name.

### `place`, `organization`, `domain`

`place.templates` covers settlements and features. `organization` and `domain` are objects of
template arrays keyed by subtype. Only include subtypes with data; the mixer skips empty
pools. Domain keys are `nation`, `kingdom`, `empire`, `province`, `district`, `town`.

### `weights` and `voice`

`componentWeights` and `categoryBias` are optional tuning hooks. `voice` is reserved for the
speech milestone; `preferredSpeaker`, `basePitch`, and `rate` are safe defaults.

## Template grammar

```text
"{root}{settlementSuffix}"
"{honorific} {given} of {clan}"
"{directional}-{root}"
"{settlementType} of {root}"
```

Available v1 slots:

`root`, `given`, `family`, `clan`, `honorific`, `epithet`, `prefix`, `suffix`,
`settlementType`, `settlementSuffix`, `terrain`, `directional`, `orgType`, `domainType`,
`numeral`, `article`.

Unknown slots are errors unless a plugin registers them. Templates may nest through
`surnamePatterns`, up to four levels.

## Quality checklist

- [ ] Every root has a gloss.
- [ ] Every template's slots can be resolved by this pack.
- [ ] All characters in templates and morphemes exist in `romanization` or the inventory.
- [ ] Given names are attested or plausibly derived, and the source is recorded.
- [ ] Join rules reflect a real process, not a workaround for one bad pair.
- [ ] 100 generated names per category reviewed for readability and cultural plausibility.
- [ ] No names that reproduce a living person, a sacred name used only in ritual, or a
      stereotype.
- [ ] `meta.sources`, `meta.license`, and `meta.notes` are complete.
- [ ] Status is `experimental` until a second person has reviewed the pack.

## Ethics and licensing

- **Respect closed practices.** Some names and invocations are not appropriate to generate.
  Leave them out, and say why in `notes`.
- **Do not treat a culture as a costume.** Model the naming system, not caricatured sounds.
- **Record provenance.** Every claim should trace to a source or be labeled as an
  extrapolation.
- **Check licenses.** Dictionaries and databases have terms. Do not copy a proprietary list
  into a pack. Summarize patterns and cite the source instead.
- **Invite review.** A pack about a culture you do not belong to should be reviewed by
  someone who does, where possible.

## Testing a pack

Until the Studio ships, load it from Node:

```js
import { readFileSync } from 'node:fs';
import { loadLap } from '../core/lap.js';
import { generate } from '../core/engine.js';

const lap = loadLap(readFileSync('packs/my-pack.lap', 'utf8'));
console.log(generate({ laps: [lap], category: 'person', count: 10 }));
```

Fix schema errors first, then inspect warnings. `unknown-symbol` usually means a character is
missing from `romanization`.
