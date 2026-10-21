import type { PracticeTrack } from '../types';

function track(
  id: string,
  title: string,
  artist: string,
  description: string,
  sourceKind: PracticeTrack['sourceKind'],
  bpm: number,
  chords: string[],
  color: string,
  tags: string[],
  melody?: number[],
): PracticeTrack {
  const bar = 240 / bpm;
  return {
    id, title, artist, description, sourceKind, bpm, key: 'C', timeSignature: 4,
    duration: chords.length * bar, color, tags, difficulty: '入门', melody,
    segments: chords.map((chord, index) => ({
      id: `${id}-${index}`, start: index * bar, end: (index + 1) * bar, chord,
    })),
  };
}

export const PRACTICE_TRACKS: PracticeTrack[] = [
  track(
    'evening-breeze', '晚风练习曲', '弦记原创练习',
    '从四个和弦开始，练习平稳地换把。原创和弦练习与本机合成伴奏，不是任何流行歌曲的原曲谱。',
    'original', 84,
    ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'Am', 'F', 'C'],
    'lavender', ['四和弦', '分解和弦', '换和弦练习'],
  ),
  track(
    'twinkle', '小星星', '传统旋律 · 弦记编配',
    '取自传统旋律 Ah! vous dirai-je, maman 的入门练习版，自行编配和弦并合成伴奏，不含歌词或第三方录音。',
    'public-domain', 88,
    ['C', 'F', 'G', 'C', 'F', 'C', 'G', 'C', 'C', 'F', 'G', 'C'],
    'peach', ['熟悉的旋律', '节奏练习', '传统旋律'],
    // Each entry is one beat; 0 is a rest. All notes are newly synthesized.
    [60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60, 0,
      67, 67, 65, 65, 64, 64, 62, 0, 67, 67, 65, 65, 64, 64, 62, 0,
      60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60, 0],
  ),
  track(
    'ode-to-joy', '欢乐颂', '贝多芬旋律 · 弦记编配',
    '贝多芬《第九交响曲》主题的简化练习版。旋律与和弦自行编排、合成，适合练习每小节换和弦。',
    'public-domain', 96,
    ['C', 'G', 'C', 'G', 'C', 'F', 'G', 'C', 'G', 'C', 'Dm', 'G', 'C', 'F', 'G', 'C'],
    'sage', ['经典旋律', '每小节换和弦', '节拍练习'],
    [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 0,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60, 0,
      62, 62, 64, 60, 62, 64, 65, 64, 60, 62, 64, 65, 64, 62, 60, 62,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60, 0],
  ),
];
