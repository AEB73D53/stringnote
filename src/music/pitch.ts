import { getEasyCapo, parseChord, transposeChord } from './theory';

function boundedInteger(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.trunc(value))) : 0;
}

export function capoFret(value: number): number {
  return boundedInteger(value, 0, 9);
}

function normalizedSettings(transpose: number, capo: number): { transpose: number; capo: number } {
  return { transpose: boundedInteger(transpose, -12, 12), capo: capoFret(capo) };
}

/** Moving the capo raises the unchanged fingering by one semitone per fret. */
export function soundingTranspose(transpose: number, capo: number): number {
  const settings = normalizedSettings(transpose, capo);
  return settings.transpose + settings.capo;
}

/** Find easier fingerings without changing the actual key or melody octave. */
export function recommendEasyPitch(chords: string[], transpose: number, capo: number): { transpose: number; capo: number } {
  const current = normalizedSettings(transpose, capo);
  if (!chords.some(chord => parseChord(chord))) return current;
  const total = current.transpose + current.capo;
  const soundingChords = chords.map(chord => transposeChord(chord, total));
  const suggestion = getEasyCapo(soundingChords);
  const nextTranspose = total - suggestion.capo;
  // Do not wrap a recommendation by an octave just to fit the controls. At the
  // extremes, retaining the current settings is safer than altering the sound.
  if (nextTranspose < -12 || nextTranspose > 12) return current;
  return { transpose: nextTranspose, capo: suggestion.capo };
}
