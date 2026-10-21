import { describe, expect, it } from 'vitest';
import { importTrack, trackFromChordPro } from './io';
import { toChordPro, toJson } from '../music/exporters';
import { PRACTICE_TRACKS } from '../music/catalog';
import { transposeChord } from '../music/theory';

describe('portable practice files', () => {
  it('keeps exact non-uniform timing and sounding chords through capo export/import', () => {
    const track = structuredClone(PRACTICE_TRACKS[0]);
    track.segments = [
      { id: 'a', start: 0, end: 1.2345, chord: 'D/F#' },
      { id: 'b', start: 1.2345, end: 3.9876, chord: 'Bm' },
      { id: 'c', start: 3.9876, end: 5, chord: 'N.C.' },
    ];
    track.duration = 5;
    const restored = importTrack(toChordPro(track, 2, 3), 'practice.cho');
    expect(restored.segments.map(s => [s.start, s.end])).toEqual(track.segments.map(s => [s.start, s.end]));
    expect(restored.segments.map(s => s.chord)).toEqual(track.segments.map(s => transposeChord(s.chord, 2)));
  });
  it('round trips the exported JSON envelope and rejects overlapping or excessively long timelines', () => {
    const track = PRACTICE_TRACKS[1];
    expect(importTrack(toJson(track), 'practice.json').segments.map(s => s.chord)).toEqual(track.segments.map(s => s.chord));
    for (const segments of [
      [{ start: 0, end: 3, chord: 'C' }, { start: 2, end: 4, chord: 'G' }],
      [{ start: 0, end: 601, chord: 'C' }],
    ]) expect(() => importTrack(JSON.stringify({ segments }), 'invalid.json')).toThrow();
  });
  it('reads ChordPro capo and meter without treating lyrics as chord names', () => {
    const track = trackFromChordPro('{title: Three beats}\n{capo: 2}\n{time: 3/4}\n{tempo: 90}\n[G]hello [Em]world');
    expect(track.segments.map(s => s.chord)).toEqual(['A', 'F#m']);
    expect(track.segments[0].end).toBe(2);
    expect(track.timeSignature).toBe(3);
    expect(() => trackFromChordPro('{capo: -1}\n[C]')).toThrow();
  });
});
