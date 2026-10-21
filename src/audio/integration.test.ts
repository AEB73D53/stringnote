import { expect, it } from 'vitest';
import { PRACTICE_TRACKS } from '../music/catalog';
import { renderTrackAudio } from '../music/synth';
import { analyzeSamples } from './engine';

it('transcribes the original synthesized practice backing through actual PCM', async () => {
  const track = PRACTICE_TRACKS[0];
  const wav = await (await renderTrackAudio(track)).arrayBuffer();
  const view = new DataView(wav);
  const samples = Float32Array.from({ length: (wav.byteLength - 44) / 2 }, (_, i) => view.getInt16(44 + i * 2, true) / 32768);
  const result = analyzeSamples(samples, 22050);
  let matched = 0;
  for (const reference of track.segments) {
    for (const inferred of result.segments) {
      if (reference.chord !== inferred.chord) continue;
      matched += Math.max(0, Math.min(reference.end, inferred.end) - Math.max(reference.start, inferred.start));
    }
  }
  // This is exclusively a synthesized integration check, not a real-song benchmark.
  expect(matched / track.duration).toBeGreaterThan(0.8);
  expect(result.duration).toBeCloseTo(track.duration, 3);
});
