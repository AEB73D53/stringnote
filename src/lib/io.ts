import type { PracticeTrack } from '../types';
import { parseChord, transposeChord } from '../music/theory';

export function downloadFile(content: string | Blob, name: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content);
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[<>:"/\\|?*]/g, '-');
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importTrack(text: string, filename: string): PracticeTrack {
  if (text.length > 2_000_000) throw new Error('曲谱文件过大，请使用 2 MB 以内的 JSON 或 ChordPro 文件。');
  if (filename.toLowerCase().endsWith('.json')) {
    const raw = JSON.parse(text);
    const data = raw.track ?? raw;
    if (!data || !Array.isArray(data.segments) || data.segments.length > 10000) throw new Error('JSON 中没有有效的和弦片段。');
    let lastEnd = 0;
    const segments = data.segments.map((segment: Record<string, unknown>, i: number) => {
      const rawStart = Number(segment.start), end = Number(segment.end), chord = String(segment.chord ?? '');
      if (!Number.isFinite(rawStart) || !Number.isFinite(end) || rawStart < lastEnd - 0.000001 || end <= rawStart || end > 600 || (!parseChord(chord) && chord !== 'N.C.')) throw new Error(`第 ${i + 1} 个和弦片段无效、与前一段重叠或超出 10 分钟。`);
      const start = Math.max(rawStart, lastEnd);
      lastEnd = end;
      return { id: crypto.randomUUID(), start, end, chord };
    });
    if (!segments.length) throw new Error('曲谱至少需要一个和弦。');
    return { id: crypto.randomUUID(), title: String(data.title ?? filename).slice(0, 120), artist: String(data.artist ?? '导入曲谱').slice(0, 120), description: '用户导入的和弦谱；如未附音频，可先听合成伴奏。', sourceKind: 'user', bpm: Number(data.bpm) > 0 && Number(data.bpm) < 400 ? Number(data.bpm) : 84, key: String(data.key ?? '待确认').slice(0, 16), timeSignature: [3, 4, 6].includes(data.timeSignature) ? data.timeSignature : 4, duration: lastEnd, segments, color: 'lavender', difficulty: '待确认', tags: ['导入曲谱'], createdAt: Date.now() };
  }
  return trackFromChordPro(text, filename);
}

export function trackFromChordPro(text: string, fallback = '我的练习曲'): PracticeTrack {
  const meta = (key: string) => text.match(new RegExp(`\\{${key}:\\s*([^}]+)\\}`, 'i'))?.[1]?.trim();
  const bpm = Math.max(30, Math.min(240, Number(meta('tempo')) || 84));
  const capo = Number(meta('capo') ?? 0);
  if (!Number.isInteger(capo) || capo < 0 || capo > 12) throw new Error('变调夹品位必须是 0–12 之间的整数。');
  const beats = Number(meta('time')?.split('/')[0]);
  const timeSignature = [3, 4, 6].includes(beats) ? beats : 4;
  const chordTokens = [...text.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim());
  const chords = chordTokens.length ? chordTokens : text.replace(/\{[^}]*\}/g, '').trim().split(/[\s|,，]+/).filter(Boolean);
  if (!chords.length || chords.length > 1024) throw new Error('请填写 1–1024 个和弦，例如 C Am F G。');
  const invalid = chords.find(c => !parseChord(c) && c !== 'N.C.');
  if (invalid) throw new Error(`暂不支持“${invalid}”，请使用 C、Am、Fmaj7 等和弦记号。`);
  const bar = 60 * timeSignature / bpm;
  const timings = [...text.matchAll(/\{comment:\s*@stringnote-time\s+([\d.]+)\s+([\d.]+)\}/g)].map(match => ({ start: Number(match[1]), end: Number(match[2]) }));
  if (timings.length && timings.length !== chords.length) throw new Error('精确时间标记与和弦数量不一致，请检查文件。');
  let lastEnd = 0;
  const segments = chords.map((chord, i) => {
    const timing = timings[i] ?? { start: i * bar, end: (i + 1) * bar };
    if (!Number.isFinite(timing.start) || !Number.isFinite(timing.end) || timing.start < lastEnd - 0.000001 || timing.end <= timing.start || timing.end > 600) throw new Error('曲谱时间位置无效、重叠或超过 10 分钟，请分段导入。');
    const start = Math.max(lastEnd, timing.start); lastEnd = timing.end;
    return { id: crypto.randomUUID(), start, end: timing.end, chord: transposeChord(chord, capo) };
  });
  return { id: crypto.randomUUID(), title: (meta('title') ?? fallback.replace(/\.[^.]+$/, '')).slice(0, 120), artist: (meta('artist') ?? '我的编配').slice(0, 120), description: timings.length ? '导入的结构化和弦谱，保留原始时间位置与实际发声和弦。' : '自行录入的练习编配，每个和弦默认一小节，可在谱面中继续修改。', sourceKind: 'user', bpm, key: transposeChord(meta('key') ?? 'C', capo), timeSignature, duration: lastEnd, segments, color: 'mint', difficulty: '待确认', tags: ['自行编配'], createdAt: Date.now() };
}
