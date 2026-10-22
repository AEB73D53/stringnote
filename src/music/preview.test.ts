import { describe, expect, it } from 'vitest';
import type { SavedPractice } from '../lib/storage';
import type { PracticeTrack } from '../types';
import { PRACTICE_TRACKS } from './catalog';
import { resolveAudioKind, synthesisSignature, trackForSynthesis } from './preview';

function example(): PracticeTrack {
  return { ...structuredClone(PRACTICE_TRACKS[0]), melody: [60, 0, 64, 67] };
}
function record(track: PracticeTrack, audio: Blob = new Blob(['audio'], { type: 'audio/wav' })): SavedPractice {
  return { id: track.id, track, audio, updatedAt: 1 };
}

describe('synthesis preview identity and pitch', () => {
  it('invalidates edited sound while returning to the same signature after undo', () => {
    const original = example();
    const signature = synthesisSignature(original);
    const renamed = structuredClone(original);
    renamed.id = 'another-id'; renamed.title = 'new title'; renamed.key = '待确认';
    renamed.segments[0].id = 'another-segment-id'; renamed.segments[0].confidence = 0.1;
    Object.assign(renamed, { capo: 4 });
    expect(synthesisSignature(renamed)).toBe(signature);

    const edited = structuredClone(original);
    edited.segments[0].chord = 'Dm';
    expect(synthesisSignature(edited)).not.toBe(signature);
    expect(synthesisSignature(structuredClone(original))).toBe(signature);
    expect(synthesisSignature({ ...original, bpm: original.bpm + 4 })).not.toBe(signature);
    expect(synthesisSignature({ ...original, timeSignature: 3 })).not.toBe(signature);
    expect(synthesisSignature({ ...original, melody: [62, 0, 64, 67] })).not.toBe(signature);
    expect(synthesisSignature(original, 12)).not.toBe(signature);
  });

  it('transposes actual chords, slash bass, melody and key without applying capo or mutating the source', () => {
    const original = example();
    original.segments[0].chord = 'C/G'; original.segments[1].chord = 'N.C.';
    Object.assign(original, { capo: 5 });
    const before = structuredClone(original);
    const shifted = trackForSynthesis(original, 2.8);
    expect(shifted.segments[0].chord).toBe('D/A');
    expect(shifted.segments[1].chord).toBe('N.C.');
    expect(shifted.melody).toEqual([62, 0, 66, 69]);
    expect(shifted.key).toBe('D');
    expect(shifted.duration).toBe(original.duration);
    expect(shifted.segments.map(s => [s.start, s.end])).toEqual(original.segments.map(s => [s.start, s.end]));
    expect(original).toEqual(before);
    expect(synthesisSignature(original, 2.8)).toBe(synthesisSignature(original, 2));
    expect(trackForSynthesis(original, NaN).melody).toEqual(original.melody);
  });
});

describe('legacy audio cache provenance', () => {
  it('protects original WAV recordings and unknown blobs from synthesis replacement', () => {
    const user = { ...example(), sourceKind: 'user' as const, artist: '我的录音', tags: ['识别草稿'] };
    expect(resolveAudioKind(record(user))).toBe('original');
    expect(resolveAudioKind(record({ ...user, tags: [] }))).toBe('original');
    const originalFile = new File(['wav data'], 'my-recording.wav', { type: 'audio/wav' });
    expect(resolveAudioKind(record({ ...user, tags: ['导入曲谱'] }, originalFile))).toBe('original');
  });

  it('recognizes known synthesized caches and lets explicit metadata win', () => {
    expect(resolveAudioKind(record(example()))).toBe('synthesized');
    expect(resolveAudioKind(record({ ...example(), sourceKind: 'public-domain' }))).toBe('synthesized');
    expect(resolveAudioKind(record({ ...example(), sourceKind: 'user', artist: '我的编配', tags: ['自行编配'] }))).toBe('synthesized');
    expect(resolveAudioKind(record({ ...example(), sourceKind: 'user', artist: '导入曲谱', tags: ['导入曲谱'] }))).toBe('synthesized');
    const declared = Object.assign(record(example()), { audioKind: 'original' as const });
    expect(resolveAudioKind(declared)).toBe('original');
  });
});
