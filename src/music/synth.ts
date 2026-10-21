import type { PracticeTrack } from '../types';
import { chordToMidi } from './theory';

const SAMPLE_RATE = 22050;
const TAU = Math.PI * 2;

/** A deterministic plucked-string oscillator; uses no external sound recording. */
function pluck(buffer: Float32Array, midi: number, startSeconds: number, lengthSeconds: number, volume: number): void {
  if (!Number.isFinite(midi) || !Number.isFinite(startSeconds) || !Number.isFinite(lengthSeconds) || lengthSeconds <= 0) return;
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const length = Math.min(Math.floor(lengthSeconds * SAMPLE_RATE), buffer.length - start);
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  // Small inharmonicity and short high harmonics approximate a nylon-string pluck.
  const harmonics = [1, 0.37, 0.18, 0.09, 0.045];
  for (let harmonic = 1; harmonic <= harmonics.length; harmonic++) {
    const omega = TAU * frequency * harmonic / SAMPLE_RATE;
    const decay = Math.exp(-(1.8 + harmonic * 0.7) / SAMPLE_RATE);
    let amplitude = harmonics[harmonic - 1] * volume;
    const cos = Math.cos(omega);
    const sin = Math.sin(omega);
    let x = 1;
    let y = 0;
    for (let i = 0; i < length; i++) {
      const attack = Math.min(1, i / (SAMPLE_RATE * 0.006));
      const release = Math.min(1, (length - i) / (SAMPLE_RATE * 0.035));
      buffer[start + i] += y * amplitude * attack * release;
      const nextX = x * cos - y * sin;
      y = x * sin + y * cos;
      x = nextX;
      amplitude *= decay;
    }
  }
}

export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Blob {
  const data = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(data);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return new Blob([data], { type: 'audio/wav' });
}

export async function renderTrackAudio(track: PracticeTrack): Promise<Blob> {
  if (!Number.isFinite(track.duration) || track.duration <= 0 || track.duration > 600) {
    throw new Error('练习曲时长应在 0 到 600 秒之间。');
  }
  let lastEnd = 0;
  for (const segment of track.segments) {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)
      || segment.start < lastEnd - 0.000001 || segment.end <= segment.start
      || segment.end > track.duration + 0.000001) {
      throw new Error('和弦片段的时间位置无效或重叠，请先修正曲谱。');
    }
    lastEnd = segment.end;
  }
  const buffer = new Float32Array(Math.ceil(track.duration * SAMPLE_RATE));
  const bpm = Number.isFinite(track.bpm) && track.bpm > 0 ? Math.max(20, Math.min(300, track.bpm)) : 84;
  const beat = 60 / bpm;
  for (let index = 0; index < track.segments.length; index++) {
    const segment = track.segments[index];
    const notes = chordToMidi(segment.chord);
    if (!notes.length) continue;
    const duration = segment.end - segment.start;
    // Bass on the first and third beats, alternating high-string arpeggios.
    const steps = Math.max(1, Math.floor(duration / beat * 2 + 0.0001));
    for (let step = 0; step < steps; step++) {
      const offset = step * beat / 2;
      if (offset >= duration) break;
      const pattern = [0, 2, notes.length - 1, 1, Math.min(1, notes.length - 1), 2, notes.length - 1, 2];
      const noteIndex = Math.min(notes.length - 1, pattern[step % pattern.length]);
      pluck(buffer, notes[noteIndex], segment.start + offset, Math.min(1.8, duration - offset), step % 4 === 0 ? 0.22 : 0.15);
    }
    // Quiet full chord on each bar makes the harmonic change audible.
    notes.forEach((midi, stringIndex) => {
      const offset = stringIndex * 0.012;
      pluck(buffer, midi, segment.start + offset, Math.min(2.8, duration - offset), 0.055);
    });
    if (index % 4 === 3) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  track.melody?.forEach((midi, index) => {
    if (midi <= 0 || index * beat >= track.duration) return;
    const held = track.melody?.[index + 1] === 0 ? beat * 1.75 : beat * 0.9;
    pluck(buffer, midi + 12, index * beat + 0.01, held, 0.23);
  });
  let peak = 0;
  for (let index = 0; index < buffer.length; index++) peak = Math.max(peak, Math.abs(buffer[index]));
  const gain = peak > 0 ? Math.min(2.5, 0.82 / peak) : 1;
  const fade = Math.floor(SAMPLE_RATE * 0.035);
  for (let index = 0; index < buffer.length; index++) {
    const fadeOut = Math.min(1, (buffer.length - index) / fade);
    buffer[index] *= gain * fadeOut;
  }
  return encodeWav(buffer);
}
