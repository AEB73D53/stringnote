import type { PracticeTrack } from '../types';
import { guitarVoicing } from './guitar';
import { loadGuitarSamples, type GuitarSample } from './sampleBank';

const SAMPLE_RATE = 22050;
/** A deterministic, damped delay-line string for offline/sample-load fallback. */
function modeledString(midi: number): GuitarSample {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const delay = Math.max(2, SAMPLE_RATE / frequency - 0.5);
  const ring = new Float32Array(Math.ceil(delay) + 2);
  let seed = (midi * 2654435761) >>> 0;
  for (let i = 0; i < ring.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const position = i / ring.length;
    const displacement = position < 0.22 ? position / 0.22 : (1 - position) / 0.78;
    // A string displaced by a finger, with a little pick noise. Pure white
    // excitation makes arbitrary upper harmonics dominate the chord's pitch.
    ring[i] = (displacement - 0.5) * 0.65 + (seed / 0x100000000 - 0.5) * 0.025;
  }
  const samples = new Float32Array(SAMPLE_RATE * 4);
  const loss = Math.exp(-1.7 / frequency);
  let previous = 0;
  let write = 0;
  let dc = 0;
  for (let i = 0; i < samples.length; i++) {
    const read = (write - delay + ring.length) % ring.length;
    const lower = Math.floor(read);
    const fraction = read - lower;
    const value = ring[lower] * (1 - fraction) + ring[(lower + 1) % ring.length] * fraction;
    ring[write] = (value + previous) * 0.5 * loss;
    previous = value;
    write = (write + 1) % ring.length;
    dc += 0.005 * (value - dc);
    samples[i] = (value - dc) * Math.min(1, i / (SAMPLE_RATE * 0.0015));
  }
  return { midi, samples, sampleRate: SAMPLE_RATE };
}

function pluck(buffer: Float32Array, midi: number, startSeconds: number, lengthSeconds: number, volume: number,
  bank: GuitarSample[] | null, modeled: Map<number, GuitarSample>): void {
  if (!Number.isFinite(midi) || !Number.isFinite(startSeconds) || !Number.isFinite(lengthSeconds) || lengthSeconds <= 0) return;
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const length = Math.min(Math.floor(lengthSeconds * SAMPLE_RATE), buffer.length - start);
  let voice: GuitarSample;
  if (bank?.length) {
    voice = bank.reduce((closest, sample) => Math.abs(sample.midi - midi) < Math.abs(closest.midi - midi) ? sample : closest);
  } else {
    if (!modeled.has(midi)) modeled.set(midi, modeledString(midi));
    voice = modeled.get(midi)!;
  }
  const rate = 2 ** ((midi - voice.midi) / 12) * voice.sampleRate / SAMPLE_RATE;
  // Preserve each recorded pick transient and natural body resonance. Only the
  // note-off is faded, so adjacent chords/rests never click or bleed off-time.
  const releaseFrames = Math.min(length, Math.round(SAMPLE_RATE * 0.045));
  for (let i = 0; i < length; i++) {
    const position = i * rate;
    const lower = Math.floor(position);
    if (lower + 1 >= voice.samples.length) break;
    const fraction = position - lower;
    const sample = voice.samples[lower] * (1 - fraction) + voice.samples[lower + 1] * fraction;
    const release = Math.min(1, (length - i) / Math.max(1, releaseFrames));
    buffer[start + i] += sample * volume * release;
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
  const bank = await loadGuitarSamples();
  const modeled = new Map<number, GuitarSample>();
  const bpm = Number.isFinite(track.bpm) && track.bpm > 0 ? Math.max(20, Math.min(300, track.bpm)) : 84;
  const beat = 60 / bpm;
  for (let index = 0; index < track.segments.length; index++) {
    const segment = track.segments[index];
    const notes = guitarVoicing(segment.chord);
    if (!notes.length) continue;
    const duration = segment.end - segment.start;
    // An even thumb/fingers pattern, with lighter offbeats and a gentle brush
    // of the strings on the first beat. Timing/velocity are deterministic so
    // undo restores precisely the same preview.
    const steps = Math.max(1, Math.ceil(duration / beat * 2 - 0.0001));
    const pattern = [0, Math.max(1, notes.length - 3), notes.length - 2, notes.length - 1,
      Math.min(1, notes.length - 1), Math.max(1, notes.length - 3), notes.length - 2, notes.length - 1];
    const strength = [0.65, 0.39, 0.46, 0.35, 0.55, 0.37, 0.44, 0.33];
    for (let step = 0; step < steps; step++) {
      const offset = step * beat / 2 + (step % 2 ? 0.006 : 0);
      if (offset >= duration) break;
      const noteIndex = Math.max(0, Math.min(notes.length - 1, pattern[step % pattern.length]));
      pluck(buffer, notes[noteIndex], segment.start + offset, Math.min(3.2, duration - offset), strength[step % strength.length], bank, modeled);
    }
    for (let barStart = 0; barStart < duration; barStart += beat * Math.max(1, track.timeSignature || 4)) {
      notes.forEach((midi, stringIndex) => {
        // Downstroke: bass strings first, treble strings last, never a rigid
        // simultaneous keyboard chord. Avoid doubling the thumb's bass note.
        if (stringIndex === 0) return;
        const offset = barStart + stringIndex * 0.014;
        if (offset >= duration) return;
        pluck(buffer, midi, segment.start + offset, Math.min(3.2, duration - offset), 0.22 - stringIndex * 0.012, bank, modeled);
      });
    }
    if (index % 4 === 3) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  track.melody?.forEach((midi, index) => {
    if (midi <= 0 || index * beat >= track.duration) return;
    const held = track.melody?.[index + 1] === 0 ? beat * 1.75 : beat * 0.9;
    pluck(buffer, midi + 12, index * beat + 0.01, held, 0.72, bank, modeled);
  });
  let peak = 0;
  for (let index = 0; index < buffer.length; index++) peak = Math.max(peak, Math.abs(buffer[index]));
  const gain = peak > 0 ? Math.min(12, 0.82 / peak) : 1;
  const fade = Math.floor(SAMPLE_RATE * 0.035);
  for (let index = 0; index < buffer.length; index++) {
    const fadeOut = Math.min(1, (buffer.length - index) / fade);
    buffer[index] *= gain * fadeOut;
  }
  return encodeWav(buffer);
}
