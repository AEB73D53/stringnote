import { describe, expect, it } from 'vitest';
import { PRACTICE_TRACKS } from './catalog';
import { toChordPro, toJson } from './exporters';
import { encodeWav, renderTrackAudio } from './synth';
import { chordToMidi, formatTime, getChordShape, getEasyCapo, parseChord, transposeChord } from './theory';

describe('chord names and sounding pitch', () => {
  it('transposes roots and slash bass together while preserving quality', () => {
    expect(transposeChord('D/F#', 2)).toBe('E/G#');
    expect(transposeChord('Bbmaj7/D', 2)).toBe('Cmaj7/E');
    expect(transposeChord('Am7', -2)).toBe('Gm7');
    expect(transposeChord('N.C.', 3)).toBe('N.C.');
    expect(parseChord('F♯m')).toMatchObject({ pitchClass: 6, quality: 'm' });
    expect(parseChord('hello')).toBeNull();
  });

  it('recovers sounding root and bass after transposing in both directions', () => {
    for (const name of ['C', 'F#m7', 'Bbmaj7/D', 'D/F#', 'Eb7', 'Gsus4']) {
      for (let step = -12; step <= 12; step++) {
        const restored = parseChord(transposeChord(transposeChord(name, step), -step));
        const source = parseChord(name);
        expect(restored?.pitchClass).toBe(source?.pitchClass);
        expect(restored?.bassPitchClass).toBe(source?.bassPitchClass);
        expect(restored?.quality).toBe(source?.quality);
      }
    }
  });

  it('recommends playable shapes that preserve pitch once a capo is added', () => {
    const original = ['B', 'G#m', 'E', 'F#'];
    const suggestion = getEasyCapo(original);
    expect(suggestion.capo).toBeGreaterThan(0);
    for (let index = 0; index < original.length; index++) {
      expect(parseChord(transposeChord(suggestion.shapes[index], suggestion.capo))?.pitchClass)
        .toBe(parseChord(original[index])?.pitchClass);
    }
    expect(getEasyCapo(['C', 'Am', 'G']).capo).toBe(0);
  });

  it('provides correct pitch classes in all displayed major/minor shapes', () => {
    const names = ['C', 'G', 'Am', 'F', 'Dm', 'Em', 'D', 'E', 'A', 'Bm', 'F#', 'Bbm'];
    for (const name of names) {
      const chord = parseChord(name)!;
      const allowed = [0, chord.quality === 'm' ? 3 : 4, 7].map((n) => (n + chord.pitchClass) % 12);
      const shape = getChordShape(name)!;
      expect(shape.frets).toHaveLength(6);
      expect(chordToMidi(name).every((midi) => allowed.includes(midi % 12))).toBe(true);
    }
    for (const name of ['D7', 'G7', 'Cmaj7', 'Am7', 'Fmaj7', 'Dsus4']) expect(getChordShape(name)).not.toBeNull();
    expect(getChordShape('C/F#')).toBeNull();
    expect(chordToMidi('Cdim').map((note) => note % 12)).toEqual([0, 3, 6]);
    expect(chordToMidi('Csus2').map((note) => note % 12)).toEqual([0, 2, 7]);
  });

  it('formats unknown or negative time without displaying NaN', () => {
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(-1)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
  });
});

describe('real practice material and exports', () => {
  it('keeps all catalog segments contiguous and inside the audio duration', () => {
    for (const track of PRACTICE_TRACKS) {
      expect(track.segments[0].start).toBe(0);
      expect(track.segments.at(-1)?.end).toBeCloseTo(track.duration);
      track.segments.forEach((segment, index) => {
        expect(parseChord(segment.chord)).not.toBeNull();
        if (index) expect(segment.start).toBeCloseTo(track.segments[index - 1].end);
      });
    }
  });

  it('exports capo-relative shapes and explicit sounding key', () => {
    const exported = toChordPro(PRACTICE_TRACKS[0], 2, 2);
    expect(exported).toContain('{capo: 2}');
    expect(exported).toContain('{key: C}');
    expect(exported).toContain('实际发声调 D');
    expect(exported).toContain('[C]');
    const timings = [...exported.matchAll(/@stringnote-time ([\d.]+) ([\d.]+)/g)];
    expect(timings).toHaveLength(PRACTICE_TRACKS[0].segments.length);
    expect(Number(timings[1][1])).toBe(PRACTICE_TRACKS[0].segments[1].start);
    expect(Number(timings.at(-1)![2])).toBe(PRACTICE_TRACKS[0].duration);
    expect(JSON.parse(toJson(PRACTICE_TRACKS[0])).track.id).toBe('evening-breeze');
  });

  it('does not export NaN capo or falsely known musical metadata', () => {
    const track = { ...PRACTICE_TRACKS[0], bpm: 0, key: '待确认', timeSignature: 0 };
    const exported = toChordPro(track, NaN, NaN);
    expect(exported).toContain('{capo: 0}');
    expect(exported).not.toContain('NaN');
    expect(exported).not.toContain('{key:');
    expect(exported).not.toContain('{tempo:');
    expect(exported).not.toContain('{time:');
  });

  it('encodes a valid PCM WAV and synthesizes non-silent audio matching the score', async () => {
    const encoded = await encodeWav(new Float32Array([0, 0.5, -0.5]), 22050).arrayBuffer();
    const view = new DataView(encoded);
    expect(new TextDecoder().decode(encoded.slice(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint32(40, true)).toBe(6);
    const shortTrack = { ...PRACTICE_TRACKS[0], duration: 2, segments: [{ id: 'test', start: 0, end: 2, chord: 'C' }] };
    const audio = await renderTrackAudio(shortTrack);
    const data = await audio.arrayBuffer();
    expect(audio.type).toBe('audio/wav');
    expect(data.byteLength).toBe(44 + 2 * 22050 * 2);
    const samples = new Int16Array(data.slice(44));
    expect(samples.some((sample) => Math.abs(sample) > 1000)).toBe(true);
  });

  it('renders the complete original exercise with the exact timeline duration', async () => {
    const track = PRACTICE_TRACKS[0];
    const blob = await renderTrackAudio(track);
    const data = await blob.arrayBuffer();
    expect(data.byteLength).toBe(44 + Math.ceil(track.duration * 22050) * 2);
    const samples = new Int16Array(data.slice(44));
    const end = Math.floor(track.segments.at(-1)!.start * 22050);
    expect(samples.slice(end).some((sample) => Math.abs(sample) > 1000)).toBe(true);
  });

  it('respects variable segment lengths and keeps N.C. intervals silent', async () => {
    const track = {
      ...PRACTICE_TRACKS[0], sourceKind: 'user' as const, duration: 2, bpm: 0,
      segments: [
        { id: 'one', start: 0, end: 0.6, chord: 'C' },
        { id: 'rest', start: 0.6, end: 1.3, chord: 'N.C.' },
        { id: 'two', start: 1.3, end: 2, chord: 'Am' },
      ],
    };
    const audio = await renderTrackAudio(track);
    const samples = new Int16Array((await audio.arrayBuffer()).slice(44));
    const rest = samples.slice(Math.ceil(0.6 * 22050), Math.floor(1.3 * 22050));
    expect(rest.every((sample) => sample === 0)).toBe(true);
    expect(samples.slice(Math.ceil(1.3 * 22050)).some((sample) => Math.abs(sample) > 1000)).toBe(true);
    expect(await renderTrackAudio({ ...track, bpm: Infinity })).toBeInstanceOf(Blob);
  });

  it('rejects invalid segment timelines instead of synthesizing a shifted score', async () => {
    const track = { ...PRACTICE_TRACKS[0], duration: 2, segments: [{ id: 'bad', start: -1, end: 1, chord: 'C' }] };
    await expect(renderTrackAudio(track)).rejects.toThrow('时间位置');
  });
});
