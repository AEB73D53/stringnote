import { describe, expect, it } from 'vitest';
import { recommendEasyPitch, soundingTranspose } from './pitch';
import { parseChord, transposeChord } from './theory';

describe('guitar fingering and sounding pitch settings', () => {
  it('raises unchanged fingerings by the capo frets and combines manual transposition', () => {
    expect(soundingTranspose(0, 2)).toBe(2);
    expect(transposeChord('C', soundingTranspose(0, 2))).toBe('D');
    expect(soundingTranspose(2, 2)).toBe(4);
    expect(transposeChord('C', soundingTranspose(2, 2))).toBe('E');
    expect(soundingTranspose(-2, 2)).toBe(0);
  });

  it('normalizes non-finite, fractional and out-of-range controls safely', () => {
    expect(soundingTranspose(NaN, Infinity)).toBe(0);
    expect(soundingTranspose(2.9, 3.9)).toBe(5);
    expect(soundingTranspose(100, 100)).toBe(21);
    expect(soundingTranspose(-100, -100)).toBe(-12);
  });

  it('changes difficult fingerings while preserving the actual sounding harmony', () => {
    const chords = ['B', 'G#m', 'E', 'F#'];
    const before = [...chords];
    const next = recommendEasyPitch(chords, 0, 0);
    expect(next.capo).toBeGreaterThan(0);
    expect(next.transpose).toBe(-next.capo);
    for (const chord of chords) {
      const fingering = transposeChord(chord, next.transpose);
      expect(parseChord(transposeChord(fingering, next.capo))?.pitchClass).toBe(parseChord(chord)?.pitchClass);
    }
    expect(chords).toEqual(before);
  });

  it('keeps the total shift exactly, including its octave, throughout the control range', () => {
    const chords = ['C', 'Am', 'F', 'G'];
    for (let transpose = -12; transpose <= 12; transpose++) {
      for (let capo = 0; capo <= 9; capo++) {
        const next = recommendEasyPitch(chords, transpose, capo);
        expect(next.transpose).toBeGreaterThanOrEqual(-12);
        expect(next.transpose).toBeLessThanOrEqual(12);
        expect(next.capo).toBeGreaterThanOrEqual(0);
        expect(next.capo).toBeLessThanOrEqual(9);
        expect(next.transpose + next.capo).toBe(transpose + capo);
      }
    }
    const highest = recommendEasyPitch(chords, 12, 9);
    const lowest = recommendEasyPitch(chords, -12, 0);
    expect(soundingTranspose(highest.transpose, highest.capo)).toBe(21);
    expect(soundingTranspose(lowest.transpose, lowest.capo)).toBe(-12);
    expect(recommendEasyPitch(['N.C.'], 3, 4)).toEqual({ transpose: 3, capo: 4 });
  });
});
