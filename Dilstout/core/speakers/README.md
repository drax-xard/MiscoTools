# Speakers (v1 interface only)

No audio is synthesised in v1. This folder fixes the contract so the voice milestone can add
engines without touching the generator.

## Contract

```js
{
  id: 'formant',
  label: 'Formant synthesizer',
  async speak({ phonemes, prosody, voice }) {}
}
```

- `phonemes`: output of the phoneme resolver, `[{ symbol, grapheme, lapId, features }]`.
- `prosody`: interpolated values from active packs (`tempo`, `pitch`, `stress`, ...).
- `voice`: preset-level hints such as `blendStrength`.

Speakers register with `registry.speakers`. The planned default is a Klatt-style formant
synthesizer driven by the articulatory features in each pack's inventory; eSpeak-NG WASM and
cloud TTS remain optional plugins.

## Why not ship a speaker now

The `.lap` schema already stores IPA, articulatory features, romanization, and prosody. Voice
work depends on those fields being populated by real packs (M2) before synthesis quality can
be judged. See `docs/ROADMAP.md`, milestones M5 and M6.
