import { describe, expect, it } from 'vitest';
import { PRACTICE_TRACKS } from './catalog';
import { renderTrackAudio } from './synth';

async function pcm(capo: number, melody?: number[]) {
  const track = {
    ...PRACTICE_TRACKS[0], bpm: melody ? 120 : 20, duration: 1, melody,
    segments: [{ id: 'test', start: 0, end: 1, chord: melody ? 'N.C.' : 'C' }],
  };
  const bytes = await (await renderTrackAudio(track, capo)).arrayBuffer();
  const view = new DataView(bytes);
  const samples = Float64Array.from({ length: (bytes.byteLength - 44) / 2 }, (_, i) => view.getInt16(44 + 2 * i, true) / 32768);
  return { samples, rate: view.getUint32(24, true), bytes };
}

/** Measure the PCM spectrum, independently of the synthesizer's MIDI inputs. */
function strongestFrequency(samples: Float64Array, rate: number, low: number, high: number): number {
  const start = Math.round(rate * 0.05);
  const length = Math.round(rate * 0.75);
  const window = Float64Array.from({ length }, (_, i) => samples[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1))));
  let bestFrequency = low;
  let bestPower = 0;
  for (let frequency = low; frequency <= high; frequency += 0.5) {
    const coefficient = 2 * Math.cos(2 * Math.PI * frequency / rate);
    let previous = 0;
    let previousTwo = 0;
    for (const sample of window) {
      const current = sample + coefficient * previous - previousTwo;
      previousTwo = previous;
      previous = current;
    }
    const power = previous * previous + previousTwo * previousTwo - coefficient * previous * previousTwo;
    if (power > bestPower) { bestPower = power; bestFrequency = frequency; }
  }
  return bestFrequency;
}

describe('physical capo audio', () => {
  it('raises the same C fingering bass instead of substituting a lower target-chord grip', async () => {
    const measured: number[] = [];
    for (const [capo, expectedHz] of [[0, 130.8128], [2, 146.8324], [4, 164.8138], [9, 220]] as const) {
      const audio = await pcm(capo);
      expect(audio.samples.length / audio.rate).toBe(1);
      const frequency = strongestFrequency(audio.samples, audio.rate, 75, 255);
      expect(Math.abs(frequency - expectedHz), `capo ${capo}: ${frequency} Hz`).toBeLessThan(1.2);
      measured.push(frequency);
    }
    expect(measured).toEqual([...measured].sort((a, b) => a - b));
  });

  it('raises the melody with the capo and preserves its rest', async () => {
    const original = await pcm(0, [48, 0]);
    const raised = await pcm(4, [48, 0]);
    expect(Math.abs(strongestFrequency(original.samples, original.rate, 250, 450) - 261.6256)).toBeLessThan(1.2);
    expect(Math.abs(strongestFrequency(raised.samples, raised.rate, 250, 450) - 329.6276)).toBeLessThan(1.2);
    expect(raised.samples.slice(Math.ceil(0.9 * raised.rate)).every(sample => sample === 0)).toBe(true);
  });

  it('normalizes the capo consistently with the controls', async () => {
    expect((await pcm(NaN)).bytes).toEqual((await pcm(0)).bytes);
    expect((await pcm(100)).bytes).toEqual((await pcm(9)).bytes);
    expect((await pcm(2.8)).bytes).toEqual((await pcm(2)).bytes);
  });
});
