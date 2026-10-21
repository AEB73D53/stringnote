import type { ChordShape } from '../types';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod = (n: number) => ((n % 12) + 12) % 12;

export interface ParsedChord {
  root: string;
  quality: string;
  bass: string | null;
  pitchClass: number;
  bassPitchClass: number | null;
}

function notePitch(note: string): number {
  return mod(NATURAL[note[0]] + (note[1] === '#' ? 1 : note[1] === 'b' ? -1 : 0));
}

/** Accept the chord qualities this app can safely render; reject arbitrary text. */
export function parseChord(name: string): ParsedChord | null {
  const normalized = name.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/−/g, 'm');
  const match = normalized.match(/^([A-G](?:#|b)?)(maj7|maj9|min7|min|m7|m9|m|7|9|11|13|6|m6|sus2|sus4|add9|dim7|dim|aug|5)?(?:\/([A-G](?:#|b)?))?$/);
  if (!match) return null;
  const root = match[1];
  const quality = (match[2] ?? '').replace(/^min/, 'm');
  const bass = match[3] ?? null;
  return { root, quality, bass, pitchClass: notePitch(root), bassPitchClass: bass ? notePitch(bass) : null };
}

export function transposeChord(name: string, semitones: number, preferFlats?: boolean): string {
  if (/^(?:N\.?C\.?|无和弦|—|-)$/i.test(name.trim())) return 'N.C.';
  const chord = parseChord(name);
  if (!chord || !Number.isFinite(semitones)) return name;
  if (mod(Math.trunc(semitones)) === 0) return `${chord.root}${chord.quality}${chord.bass ? `/${chord.bass}` : ''}`;
  const notes = (preferFlats ?? name.includes('b')) ? FLATS : SHARPS;
  return notes[mod(chord.pitchClass + Math.trunc(semitones))] + chord.quality
    + (chord.bassPitchClass === null ? '' : `/${notes[mod(chord.bassPitchClass + Math.trunc(semitones))]}`);
}

// Strings are ordered low E → high e. Frets are absolute, -1 means muted.
const OPEN_SHAPES: Record<string, Omit<ChordShape, 'name'>> = {
  C: { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  G: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  Am: { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  F: { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 1, from: 0, to: 5 } },
  Dm: { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  Em: { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  D: { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  E: { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  A: { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  Bm: { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2, barre: { fret: 2, from: 1, to: 5 } },
  D7: { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  G7: { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  Cmaj7: { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] },
  Am7: { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  Fmaj7: { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] },
  Dsus4: { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4] },
  A7: { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  E7: { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  Em7: { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  Dm7: { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], barre: { fret: 1, from: 4, to: 5 } },
  Dmaj7: { frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1], barre: { fret: 2, from: 3, to: 5 } },
  Amaj7: { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0] },
  Asus2: { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 2, 3, 0, 0] },
  Asus4: { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0] },
  Cadd9: { frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4] },
  'C/G': { frets: [3, 3, 2, 0, 1, 0], fingers: [3, 4, 2, 0, 1, 0] },
  'C/E': { frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  'D/F#': { frets: [2, 0, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3] },
  'G/B': { frets: [-1, 2, 0, 0, 3, 3], fingers: [0, 1, 0, 0, 3, 4] },
  'Am/G': { frets: [3, 0, 2, 2, 1, 0], fingers: [4, 0, 2, 3, 1, 0] },
  'F/C': { frets: [-1, 3, 3, 2, 1, 1], fingers: [0, 3, 4, 2, 1, 1], barre: { fret: 1, from: 4, to: 5 } },
};

const E_SHAPES: Record<string, number[]> = {
  '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0],
  '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, 2, 1, 1, 0, 0], sus4: [0, 2, 2, 2, 0, 0],
  '5': [0, 2, 2, -1, -1, -1],
};

export function getChordShape(name: string): ChordShape | null {
  const chord = parseChord(name);
  if (!chord) return null;
  const canonical = SHARPS[chord.pitchClass] + chord.quality + (chord.bassPitchClass === null ? '' : `/${SHARPS[chord.bassPitchClass]}`);
  const direct = OPEN_SHAPES[canonical];
  if (direct) return { ...direct, name, frets: [...direct.frets], fingers: direct.fingers ? [...direct.fingers] : undefined };
  if (chord.bassPitchClass !== null && chord.bassPitchClass !== chord.pitchClass) return null;
  const base = E_SHAPES[chord.quality];
  if (!base) return null;
  const fret = mod(chord.pitchClass - 4);
  return {
    name, frets: base.map((n) => n < 0 ? -1 : n + fret),
    baseFret: fret > 0 ? fret : 1,
    barre: fret > 0 && chord.quality !== '5' ? { fret, from: 0, to: 5 } : undefined,
  };
}

function shapeCost(name: string): number {
  if (/^N\.?C\.?$/i.test(name)) return 0;
  const shape = getChordShape(name);
  if (!shape) return 12;
  const fretted = shape.frets.filter((n) => n > 0);
  const high = Math.max(0, ...fretted);
  const span = fretted.length ? high - Math.min(...fretted) : 0;
  return (shape.barre ? 5 : 0) + Math.max(0, high - 3) * 0.6 + span * 0.35;
}

/** Compare fingerings only; shapes + capo always preserve the original sounding chords. */
export function getEasyCapo(chords: string[]): { capo: number; shapes: string[]; score: number } {
  const valid = chords.filter((chord) => parseChord(chord));
  if (!valid.length) return { capo: 0, shapes: [...chords], score: 0 };
  let best = { capo: 0, shapes: chords.map((c) => transposeChord(c, 0)), score: Infinity };
  for (let capo = 0; capo <= 7; capo++) {
    const shapes = chords.map((chord) => transposeChord(chord, -capo));
    const score = shapes.reduce((sum, chord) => sum + shapeCost(chord), 0) / Math.max(1, shapes.length) + capo * 0.12;
    if (score < best.score) best = { capo, shapes, score };
  }
  return best;
}

export function formatTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function chordToMidi(name: string): number[] {
  const chord = parseChord(name);
  if (!chord) return [];
  const shape = getChordShape(name);
  if (shape) {
    const tuning = [40, 45, 50, 55, 59, 64];
    return shape.frets.flatMap((fret, index) => fret < 0 ? [] : [tuning[index] + fret]);
  }
  const intervalSets: Record<string, number[]> = {
    '': [0, 4, 7], m: [0, 3, 7], '5': [0, 7],
    '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
    '9': [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
    '11': [0, 4, 7, 10, 14, 17], '13': [0, 4, 7, 10, 14, 21],
    '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], sus2: [0, 2, 7], sus4: [0, 5, 7],
    add9: [0, 4, 7, 14], dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8],
  };
  const intervals = intervalSets[chord.quality] ?? [0, 4, 7];
  const notes = intervals.map((interval) => 48 + chord.pitchClass + interval);
  if (chord.bassPitchClass !== null) notes.unshift(36 + chord.bassPitchClass);
  return notes;
}
