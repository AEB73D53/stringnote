import type { SavedPractice } from '../lib/storage';
import type { PracticeTrack } from '../types';
import { transposeChord } from './theory';

const SYNTH_VERSION = 'stringnote-acoustic-guitar-v2';

/** Preserve octave shifts: melody +12 is audibly different from melody +0. */
function normalizedTranspose(transpose: number): number {
  return Number.isFinite(transpose) ? Math.trunc(transpose) || 0 : 0;
}

/** A stable identity for sound-producing inputs, independent of display metadata. */
export function synthesisSignature(track: PracticeTrack, transpose = 0): string {
  return JSON.stringify({
    synthVersion: SYNTH_VERSION,
    bpm: track.bpm,
    timeSignature: track.timeSignature,
    duration: track.duration,
    segments: track.segments.map(segment => [segment.start, segment.end, segment.chord]),
    melody: track.melody ?? [],
    normalizedTranspose: normalizedTranspose(transpose),
  });
}

/** Create sounding pitches for preview; capo only changes the displayed fingering. */
export function trackForSynthesis(track: PracticeTrack, transpose = 0): PracticeTrack {
  const shifted = structuredClone(track);
  const semitones = normalizedTranspose(transpose);
  shifted.key = transposeChord(track.key, semitones);
  shifted.segments = track.segments.map(segment => ({ ...segment, chord: transposeChord(segment.chord, semitones) }));
  shifted.melody = track.melody?.map(note => note > 0 ? note + semitones : note);
  return shifted;
}

/**
 * Migrate old cache records conservatively. A WAV MIME type cannot establish
 * whether audio is synthesized, so ambiguous audio must remain original.
 */
export function resolveAudioKind(record: SavedPractice): 'original' | 'synthesized' {
  const declared = (record as SavedPractice & { audioKind?: 'original' | 'synthesized' }).audioKind;
  if (declared === 'original' || declared === 'synthesized') return declared;
  if (!record.audio) return 'synthesized';

  const { track } = record;
  if (track.tags.includes('识别草稿') || /(?:本机音频|原音频|识别草稿)/.test(track.artist)) return 'original';
  if (typeof File !== 'undefined' && record.audio instanceof File) return 'original';

  if (track.sourceKind === 'original' || track.sourceKind === 'public-domain') return 'synthesized';
  if (track.tags.some(tag => tag === '自行编配' || tag === '导入曲谱')) return 'synthesized';
  return 'original';
}
