import { getChordShape, parseChord } from './theory';

const TUNING = [40, 45, 50, 55, 59, 64];
const mod = (value: number) => ((value % 12) + 12) % 12;

// Optional fifths/ninths may be omitted in extended guitar grips. The third,
// seventh and named extension stay present so that the chord keeps its colour.
const INTERVALS: Record<string, { required: number[]; optional?: number[] }> = {
  '': { required: [0, 4, 7] }, m: { required: [0, 3, 7] }, '5': { required: [0, 7] },
  '7': { required: [0, 4, 10], optional: [7] },
  m7: { required: [0, 3, 10], optional: [7] },
  maj7: { required: [0, 4, 11], optional: [7] },
  '9': { required: [0, 4, 10, 2], optional: [7] },
  m9: { required: [0, 3, 10, 2], optional: [7] },
  maj9: { required: [0, 4, 11, 2], optional: [7] },
  '11': { required: [0, 4, 10, 5], optional: [2, 7] },
  '13': { required: [0, 4, 10, 9], optional: [2, 7] },
  '6': { required: [0, 4, 7, 9] }, m6: { required: [0, 3, 7, 9] },
  sus2: { required: [0, 2, 7] }, sus4: { required: [0, 5, 7] },
  add9: { required: [0, 4, 7, 2] }, dim: { required: [0, 3, 6] },
  dim7: { required: [0, 3, 6, 9] }, aug: { required: [0, 4, 8] },
};

const cache = new Map<string, number[]>();

function maskOf(notes: number[]): number {
  return notes.reduce((mask, note) => mask | (1 << mod(note)), 0);
}

function countBits(value: number): number {
  let count = 0;
  while (value) { value &= value - 1; count++; }
  return count;
}

/** A lower fret can be barred beneath higher frets, but not across an open note. */
function fingerCount(frets: number[]): number {
  const positive = frets.filter((fret) => fret > 0);
  let saving = 0;
  for (const fret of new Set(positive)) {
    let count = 0;
    for (const current of frets) {
      if (current >= 0 && current < fret) count = 0;
      else if (current === fret) {
        count++;
        saving = Math.max(saving, count - 1);
      }
    }
  }
  return positive.length - saving;
}

/** Sounding MIDI notes ordered from the low E string to the high e string.
 * Common open grips match the displayed diagrams; other chords use a compact
 * guitar grip rather than a stack of close-position keyboard chord tones.
 */
export function guitarVoicing(name: string): number[] {
  const chord = parseChord(name);
  if (!chord) return [];
  const key = `${chord.pitchClass}:${chord.quality}:${chord.bassPitchClass ?? chord.pitchClass}`;
  const cached = cache.get(key);
  if (cached) return [...cached];

  const definition = INTERVALS[chord.quality];
  if (!definition) return [];
  const required = definition.required.map((interval) => mod(interval + chord.pitchClass));
  const optional = (definition.optional ?? []).map((interval) => mod(interval + chord.pitchClass));
  const requiredMask = maskOf(required);
  const optionalMask = maskOf(optional);
  const bass = chord.bassPitchClass ?? chord.pitchClass;
  const allowedMask = requiredMask | optionalMask | (1 << bass);
  const shape = getChordShape(name);
  if (shape && Math.max(...shape.frets) <= 5) {
    const notes = shape.frets.flatMap((fret, string) => fret < 0 ? [] : [TUNING[string] + fret]);
    if (mod(notes[0]) === bass && (maskOf(notes) & requiredMask) === requiredMask) {
      cache.set(key, notes);
      return [...notes];
    }
  }

  let best: number[] = [];
  let bestScore = Infinity;
  const selected: number[] = [];
  const frets: number[] = [];

  // Search one hand position at a time; an open string can ring beside it.
  for (let position = 0; position <= 9; position++) {
    const choices = TUNING.map((open) => {
      const values = [-1];
      for (let fret = 0; fret <= 12; fret++) {
        if (fret !== 0 && (fret < position || fret > position + 4)) continue;
        if (allowedMask & (1 << mod(open + fret))) values.push(fret);
      }
      return values;
    });

    const search = (string: number, presentMask: number): void => {
      if (countBits(requiredMask & ~presentMask) > 6 - string) return;
      if (string === 6) {
        if (selected.length < Math.min(3, required.length) || (presentMask & requiredMask) !== requiredMask) return;
        const fingers = fingerCount(frets);
        if (fingers > 4) return;
        const positive = frets.filter((fret) => fret > 0);
        const high = Math.max(0, ...positive);
        const span = positive.length ? high - Math.min(...positive) : 0;
        if (span > 4) return;
        const score = high * 0.8 + positive.reduce((sum, fret) => sum + fret, 0) * 0.07
          + span * 0.5 + fingers * 0.2 + (selected[0] - 40) * 0.12
          + countBits(optionalMask & ~presentMask) * 2.2 - selected.length * 1.2
          - frets.filter((fret) => fret === 0).length * 0.35
          + (selected[0] < 45 && selected[1] - selected[0] < 4 ? 2 : 0);
        if (score < bestScore) { bestScore = score; best = [...selected]; }
        return;
      }
      for (const fret of choices[string]) {
        frets.push(fret);
        if (fret < 0) search(string + 1, presentMask);
        else {
          const note = TUNING[string] + fret;
          const previous = selected.at(-1);
          if ((previous === undefined && mod(note) === bass) || (previous !== undefined && note >= previous)) {
            selected.push(note);
            search(string + 1, presentMask | (1 << mod(note)));
            selected.pop();
          }
        }
        frets.pop();
      }
    };
    search(0, 0);
  }

  // Rare slash/extension combinations can exceed a six-string hand position.
  // Keep the requested bass plus the defining tones in the guitar's register.
  // This is a harmonic approximation, not a claimed fingering diagram.
  if (!best.length) {
    const bassNote = 40 + mod(bass - 4);
    best = [bassNote];
    for (const pitchClass of required.filter((pitch) => pitch !== bass)) {
      const previous = best.at(-1)!;
      best.push(previous + 1 + mod(pitchClass - previous - 1));
    }
  }
  if (cache.size >= 256) cache.clear();
  cache.set(key, best);
  return [...best];
}
