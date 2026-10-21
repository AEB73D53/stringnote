export interface ChordSegment {
  id: string;
  start: number;
  end: number;
  chord: string;
  confidence?: number;
}

export interface PracticeTrack {
  id: string;
  title: string;
  artist: string;
  description: string;
  sourceKind: 'original' | 'public-domain' | 'user';
  bpm: number;
  key: string;
  timeSignature: number;
  duration: number;
  segments: ChordSegment[];
  color: string;
  difficulty: '入门' | '进阶' | '待确认';
  tags: string[];
  createdAt?: number;
  melody?: number[];
}

export interface AnalysisProgress {
  stage: string;
  progress: number;
}

export interface AnalysisResult {
  segments: ChordSegment[];
  bpm: number;
  key: string;
  duration: number;
  warnings: string[];
}

export interface ChordShape {
  name: string;
  frets: number[];
  fingers?: number[];
  baseFret?: number;
  barre?: { fret: number; from: number; to: number };
}
