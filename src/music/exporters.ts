import type { PracticeTrack } from '../types';
import { formatTime, parseChord, transposeChord } from './theory';

function safe(value: string): string {
  return value.replace(/[{}\r\n]/g, ' ').trim();
}

export function toChordPro(track: PracticeTrack, displayTranspose = 0, capo = 0): string {
  const semitones = Number.isFinite(displayTranspose) ? Math.trunc(displayTranspose) : 0;
  const fret = Number.isFinite(capo) ? Math.max(0, Math.min(12, Math.round(capo))) : 0;
  const soundingKey = transposeChord(track.key, semitones);
  const shapeKey = transposeChord(soundingKey, -fret);
  const lines = [
    `{title: ${safe(track.title)}}`,
    `{artist: ${safe(track.artist)}}`,
    ...(parseChord(shapeKey) ? [`{key: ${safe(shapeKey)}}`] : []),
    ...(Number.isFinite(track.bpm) && track.bpm > 0 ? [`{tempo: ${Math.round(track.bpm)}}`] : []),
    ...(track.timeSignature > 0 ? [`{time: ${track.timeSignature}/4}`] : []),
    `{capo: ${fret}}`,
    `{comment: 实际发声调 ${safe(soundingKey)}；和弦为指法，配合变调夹 ${fret} 品。}`,
    `{comment: ${safe(track.description)}}`,
    '',
  ];
  for (let index = 0; index < track.segments.length; index++) {
    const segment = track.segments[index];
    const chord = transposeChord(segment.chord, semitones - fret);
    // Standard comments preserve exact boundaries on Stringnote re-import and
    // remain harmless to ordinary ChordPro readers that do not know this tag.
    lines.push(`{comment: @stringnote-time ${segment.start} ${segment.end}}`);
    lines.push(`{comment: ${formatTime(segment.start)}–${formatTime(segment.end)}}`);
    lines.push(`[${safe(chord)}] |`);
  }
  return `${lines.join('\n')}\n`;
}

export function toJson(track: PracticeTrack): string {
  return JSON.stringify({ format: 'stringnote', version: 1, track }, null, 2);
}
