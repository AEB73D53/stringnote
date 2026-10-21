import { describe, expect, it } from 'vitest';
import { analyzeSamples } from './engine';

const sampleRate = 22050;
function chord(frequencies: number[], seconds = 3): Float32Array {
  return Float32Array.from({ length: sampleRate * seconds }, (_, i) => {
    const time = i / sampleRate;
    const fade = Math.min(1, time * 10, (seconds - time) * 10);
    return frequencies.reduce((sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time), 0) / frequencies.length * 0.45 * fade;
  });
}
function dominantChord(samples: Float32Array): string {
  const result = analyzeSamples(samples, sampleRate);
  const durations = new Map<string, number>();
  for (const segment of result.segments) durations.set(segment.chord, (durations.get(segment.chord) ?? 0) + segment.end - segment.start);
  return [...durations].sort((a, b) => b[1] - a[1])[0][0];
}

describe('spectral chord analysis', () => {
  it('recognizes C major and A minor from pitched audio', () => {
    expect(dominantChord(chord([130.8128, 164.8138, 195.9977]))).toBe('C');
    expect(dominantChord(chord([110, 130.8128, 164.8138]))).toBe('Am');
  });

  it('recognizes chords across different roots', () => {
    for (const [label, semitones] of [['D', 2], ['F', 5], ['G', 7], ['Bb', 10]] as const) {
      const shift = 2 ** (semitones / 12);
      expect(dominantChord(chord([130.8128, 164.8138, 195.9977].map(frequency => frequency * shift)))).toBe(label);
    }
  });

  it('estimates pulse tempo from attacks without inventing beat alignment', () => {
    const audio = Float32Array.from({ length: sampleRate * 10 }, (_, i) => {
      const time = i / sampleRate;
      const beatTime = time % 0.5;
      const envelope = (1 - Math.exp(-beatTime * 140)) * Math.exp(-beatTime * 4);
      return [130.8128, 164.8138, 195.9977].reduce((sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time), 0) * envelope * 0.1;
    });
    const result = analyzeSamples(audio, sampleRate);
    expect(Math.abs(result.bpm - 120)).toBeLessThanOrEqual(3);
  });

  it('preserves a real chord progression with contiguous timed segments', () => {
    const first = chord([130.8128, 164.8138, 195.9977]);
    const second = chord([110, 130.8128, 164.8138]);
    const audio = new Float32Array(first.length + second.length);
    audio.set(first); audio.set(second, first.length);
    const { segments } = analyzeSamples(audio, sampleRate);
    expect(segments.some(segment => segment.chord === 'C')).toBe(true);
    expect(segments.some(segment => segment.chord === 'Am')).toBe(true);
    expect(segments[0].start).toBe(0);
    expect(segments.at(-1)?.end).toBe(6);
    for (let i = 1; i < segments.length; i++) expect(segments[i].start).toBeCloseTo(segments[i - 1].end, 6);
    const change = segments.find(segment => segment.chord === 'Am');
    expect(Math.abs(change!.start - 3)).toBeLessThan(0.4);
  });

  it('does not fabricate chords or tempo for silence', () => {
    const result = analyzeSamples(new Float32Array(sampleRate * 6), sampleRate);
    expect(result.segments.every(segment => segment.chord === 'N.C.')).toBe(true);
    expect(result.bpm).toBe(0);
    expect(result.key).toBe('待确认');
  });

  it('treats deterministic broadband noise as unknown', () => {
    let seed = 17;
    const noise = Float32Array.from({ length: sampleRate * 3 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed / 4294967296 - 0.5) * 0.3;
    });
    expect(dominantChord(noise)).toBe('N.C.');
  });

  it('rejects invalid inputs', () => {
    expect(() => analyzeSamples(new Float32Array(0), sampleRate)).toThrow();
    expect(() => analyzeSamples(new Float32Array(10), NaN)).toThrow();
  });
});
