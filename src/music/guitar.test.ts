import { describe, expect, it } from 'vitest';
import { guitarVoicing } from './guitar';
import { chordToMidi, parseChord } from './theory';

describe('guitar accompaniment voicings', () => {
  it('uses open-string grips and honours common slash bass notes', () => {
    expect(guitarVoicing('C')).toEqual([48, 52, 55, 60, 64]);
    expect(guitarVoicing('G')).toEqual([43, 47, 50, 55, 59, 67]);
    expect(guitarVoicing('Am')).toEqual([45, 52, 57, 60, 64]);
    expect(guitarVoicing('D/F#')).toEqual([42, 45, 50, 57, 62, 66]);
    expect(guitarVoicing('C/E')[0]).toBe(40);
    expect(guitarVoicing('Bb')).toEqual(guitarVoicing('A#'));
  });

  it('keeps extensions and inversions in a guitar register instead of close keyboard triads', () => {
    const colours: Record<string, number[]> = {
      C9: [0, 4, 10, 2], Cm9: [0, 3, 10, 2], Cmaj9: [0, 4, 11, 2],
      C11: [0, 4, 10, 5], C13: [0, 4, 10, 9], C6: [0, 4, 7, 9],
      Cm6: [0, 3, 7, 9], Cdim7: [0, 3, 6, 9], Caug: [0, 4, 8],
      'C/F#': [0, 4, 7, 6],
    };
    for (const [name, required] of Object.entries(colours)) {
      const notes = guitarVoicing(name);
      expect(notes.length, name).toBeGreaterThanOrEqual(3);
      expect(notes.length, name).toBeLessThanOrEqual(6);
      expect(notes.every((note) => note >= 40 && note <= 88), name).toBe(true);
      expect(notes, name).toEqual([...notes].sort((a, b) => a - b));
      expect(required.every((pitch) => notes.some((note) => note % 12 === pitch)), name).toBe(true);
      expect(notes[0] % 12, name).toBe(name === 'C/F#' ? 6 : 0);
    }
    expect(guitarVoicing('Csus2').at(-1)! - guitarVoicing('Csus2')[0]).toBeGreaterThan(12);
  });

  it('leaves rests silent and does not expose cached mutable arrays', () => {
    expect(guitarVoicing('N.C.')).toEqual([]);
    expect(guitarVoicing('anything')).toEqual([]);
    const first = guitarVoicing('C');
    first[0] = 0;
    expect(guitarVoicing('C')[0]).toBe(48);
  });

  it('preserves chord pitch classes and the requested bass through every supported quality and key', () => {
    const qualities = ['', 'm', '7', 'm7', 'maj7', '9', 'm9', 'maj9', '11', '13', '6', 'm6', 'sus2', 'sus4', 'add9', 'dim', 'dim7', 'aug', '5'];
    for (const root of ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
      for (const quality of qualities) {
        for (const suffix of ['', '/E', '/Bb']) {
          const name = root + quality + suffix;
          const notes = guitarVoicing(name);
          const chord = parseChord(name)!;
          const allowed = chordToMidi(name).map((midi) => midi % 12);
          expect(notes.length, name).toBeGreaterThanOrEqual(2);
          expect(notes.length, name).toBeLessThanOrEqual(6);
          expect(notes.every((note) => note >= 40 && note <= 88 && allowed.includes(note % 12)), name).toBe(true);
          expect(notes[0] % 12, name).toBe(chord.bassPitchClass ?? chord.pitchClass);
        }
      }
    }
  });
});
