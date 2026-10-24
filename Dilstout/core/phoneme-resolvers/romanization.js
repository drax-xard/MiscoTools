import { symbolInventory, tokenizeWithSymbols } from '../validate.js';

export const id = 'romanization';
export const label = 'Romanization to IPA';
export const description = 'Greedy longest-match mapping from a pack romanization table to IPA phonemes.';

function featuresOf(phoneme) {
  if (!phoneme) return null;
  const { symbol, notes, ...features } = phoneme;
  return features;
}

export function resolve({ segments, lapMap, fallbackLap }) {
  const phonemes = [];
  for (const segment of segments) {
    const lap = lapMap.get(segment.lapId) ?? fallbackLap;
    if (!lap) continue;
    const symbols = symbolInventory(lap);
    const tokens = tokenizeWithSymbols(segment.value, symbols);
    for (const token of tokens) {
      const ipa = lap.phonology.romanization[token] ?? token;
      const phoneme = lap.phonology.inventory.find(
        (entry) => entry.symbol.toLowerCase() === String(ipa).toLowerCase(),
      );
      phonemes.push({
        symbol: ipa,
        grapheme: token,
        lapId: segment.lapId,
        features: featuresOf(phoneme),
      });
    }
  }
  return phonemes;
}
