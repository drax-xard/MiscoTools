import { titleCase } from '../morphology.js';

export const id = 'plain';
export const label = 'Plain romanized';
export const description = 'Title-cased, ASCII-friendly romanized output.';

export function render({ text }) {
  return titleCase(text).replace(/\s+/gu, ' ').replace(/\s*-\s*/gu, '-').trim();
}
