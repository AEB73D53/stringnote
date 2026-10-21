import type { AnalysisResult, ChordSegment } from '../types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface EngineOptions {
  windowSize?: number;
  hopSize?: number;
  onProgress?: (progress: number) => void;
}

interface Frame {
  time: number;
  energy: number;
  flux: number;
  chroma: Float64Array;
  bass: Float64Array;
  scores: Float64Array;
  tonal: boolean;
}

/** An allocation-reusing radix-two FFT; no model or remote service is involved. */
class Spectrum {
  readonly real: Float64Array;
  readonly imaginary: Float64Array;
  readonly magnitude: Float64Array;
  private readonly window: Float64Array;
  private readonly reversed: Uint32Array;

  constructor(readonly size: number) {
    this.real = new Float64Array(size);
    this.imaginary = new Float64Array(size);
    this.magnitude = new Float64Array(size / 2);
    this.window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    this.reversed = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let value = i;
      let reversed = 0;
      for (let bit = 0; bit < bits; bit++) {
        reversed = (reversed << 1) | (value & 1);
        value >>>= 1;
      }
      this.reversed[i] = reversed;
    }
  }

  process(samples: Float32Array, offset: number): Float64Array {
    const { size, real, imaginary } = this;
    for (let i = 0; i < size; i++) {
      real[this.reversed[i]] = (samples[offset + i] ?? 0) * this.window[i];
      imaginary[i] = 0;
    }
    for (let span = 2; span <= size; span *= 2) {
      const theta = -2 * Math.PI / span;
      const stepReal = Math.cos(theta);
      const stepImaginary = Math.sin(theta);
      for (let base = 0; base < size; base += span) {
        let wr = 1;
        let wi = 0;
        for (let k = 0; k < span / 2; k++) {
          const a = base + k;
          const b = a + span / 2;
          const tr = wr * real[b] - wi * imaginary[b];
          const ti = wr * imaginary[b] + wi * real[b];
          real[b] = real[a] - tr;
          imaginary[b] = imaginary[a] - ti;
          real[a] += tr;
          imaginary[a] += ti;
          const nextReal = wr * stepReal - wi * stepImaginary;
          wi = wr * stepImaginary + wi * stepReal;
          wr = nextReal;
        }
      }
    }
    for (let i = 0; i < this.magnitude.length; i++) {
      this.magnitude[i] = Math.hypot(real[i], imaginary[i]) / size;
    }
    return this.magnitude;
  }
}

function normalize(values: Float64Array): Float64Array {
  let norm = 0;
  for (const value of values) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < values.length; i++) values[i] /= norm;
  return values;
}

function extractFrame(
  samples: Float32Array,
  offset: number,
  sampleRate: number,
  spectrum: Spectrum,
  previous: Float64Array,
): Frame {
  const magnitudes = spectrum.process(samples, offset);
  const chroma = new Float64Array(12);
  const bass = new Float64Array(12);
  const lowBin = Math.max(2, Math.floor(65 * spectrum.size / sampleRate));
  const highBin = Math.min(magnitudes.length - 2, Math.ceil(2200 * spectrum.size / sampleRate));
  let energy = 0;
  let flux = 0;
  let sum = 0;
  let logSum = 0;
  let peakMass = 0;
  for (let i = offset; i < Math.min(samples.length, offset + spectrum.size); i++) energy += samples[i] * samples[i];
  energy = Math.sqrt(energy / spectrum.size);

  for (let bin = lowBin; bin <= highBin; bin++) {
    const amplitude = magnitudes[bin];
    sum += amplitude;
    logSum += Math.log(amplitude + 1e-12);
    flux += Math.max(0, amplitude - previous[bin]);
    previous[bin] = amplitude;
    if (amplitude < 1e-7 || amplitude < magnitudes[bin - 1] || amplitude < magnitudes[bin + 1]) continue;

    // Quadratic interpolation improves pitch-class assignment for low guitar notes.
    const left = Math.log(magnitudes[bin - 1] + 1e-12);
    const middle = Math.log(amplitude + 1e-12);
    const right = Math.log(magnitudes[bin + 1] + 1e-12);
    const denominator = left - 2 * middle + right;
    const shift = denominator === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator));
    const frequency = (bin + shift) * sampleRate / spectrum.size;
    const midi = 69 + 12 * Math.log2(frequency / 440);
    const rounded = Math.round(midi);
    const distance = Math.abs(midi - rounded);
    if (distance > 0.43) continue;
    const pc = ((rounded % 12) + 12) % 12;
    const tuningWeight = Math.exp(-0.5 * (distance / 0.22) ** 2);
    const weight = amplitude ** 0.7 * tuningWeight * Math.min(1, 650 / frequency);
    chroma[pc] += weight;
    peakMass += amplitude;
    if (frequency < 330) bass[pc] += weight * (330 - frequency) / 265;
  }

  const count = highBin - lowBin + 1;
  const flatness = Math.exp(logSum / count) / (sum / count + 1e-12);
  const concentration = peakMass / (sum + 1e-12);
  normalize(chroma);
  normalize(bass);
  const sorted = [...chroma].sort((a, b) => b - a);
  const dominance = sorted.slice(0, 3).reduce((total, value) => total + value * value, 0);
  const tonal = energy > 0.002 && flatness < 0.42 && concentration > 0.17 && dominance > 0.46;
  const scores = new Float64Array(25);
  let best = 0;
  for (let root = 0; root < 12; root++) {
    for (let minor = 0; minor < 2; minor++) {
      const third = (root + (minor ? 3 : 4)) % 12;
      const fifth = (root + 7) % 12;
      const match = (chroma[root] + 0.9 * chroma[third] + 0.8 * chroma[fifth]) / Math.sqrt(2.45);
      const missing = Math.min(chroma[root], chroma[third], chroma[fifth]);
      const opposingThird = chroma[(root + (minor ? 4 : 3)) % 12];
      const score = match + 0.08 * bass[root] + 0.12 * missing - 0.06 * opposingThird;
      scores[root * 2 + minor] = score;
      best = Math.max(best, score);
    }
  }
  // N.C. is a real outcome, including percussion/noise and insufficient evidence.
  scores[24] = !tonal ? 1.5 : best < 0.64 ? 0.88 : 0.35;
  return { time: (offset + spectrum.size / 2) / sampleRate, energy, flux, chroma, bass, scores, tonal };
}

function decodeStates(frames: Frame[]): number[] {
  if (!frames.length) return [];
  const count = 25;
  let previous = Float64Array.from(frames[0].scores, value => value * 4);
  const back = new Uint8Array(frames.length * count);
  for (let frame = 1; frame < frames.length; frame++) {
    const current = new Float64Array(count);
    for (let state = 0; state < count; state++) {
      let best = -Infinity;
      let bestState = state;
      for (let earlier = 0; earlier < count; earlier++) {
        const penalty = earlier === state ? 0 : (earlier === 24 || state === 24 ? 0.85 : 3.5);
        const candidate = previous[earlier] - penalty;
        if (candidate > best) { best = candidate; bestState = earlier; }
      }
      current[state] = best + frames[frame].scores[state] * 4;
      back[frame * count + state] = bestState;
    }
    previous = current;
  }
  let state = 0;
  for (let i = 1; i < count; i++) if (previous[i] > previous[state]) state = i;
  const states = new Array<number>(frames.length);
  for (let i = frames.length - 1; i >= 0; i--) {
    states[i] = state;
    state = back[i * count + state];
  }
  return states;
}

function stateName(state: number): string {
  return state === 24 ? 'N.C.' : `${NOTES[Math.floor(state / 2)]}${state % 2 ? 'm' : ''}`;
}

function segmentsFromFrames(frames: Frame[], states: number[], duration: number): ChordSegment[] {
  const segments: ChordSegment[] = [];
  let start = 0;
  for (let i = 1; i <= states.length; i++) {
    if (i < states.length && states[i] === states[start]) continue;
    const state = states[start];
    const startTime = start === 0 ? 0 : (frames[start - 1].time + frames[start].time) / 2;
    const endTime = i === states.length ? duration : (frames[i - 1].time + frames[i].time) / 2;
    let confidence = 0;
    for (let f = start; f < i; f++) {
      const scores = frames[f].scores;
      let alternative = 0;
      for (let k = 0; k < 24; k++) if (k !== state) alternative = Math.max(alternative, scores[k]);
      confidence += Math.max(0, Math.min(1, (scores[state] - alternative + 0.03) * 5));
    }
    segments.push({
      id: `segment-${segments.length}`,
      start: Math.max(0, startTime),
      end: Math.min(duration, endTime),
      chord: stateName(state),
      confidence: state === 24 ? undefined : confidence / (i - start),
    });
    start = i;
  }
  // Merge extremely short same-neighbour interruptions, without overwriting silence.
  for (let i = 1; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (segment.end - segment.start < 0.25 && segment.chord !== 'N.C.' && segments[i - 1].chord === segments[i + 1].chord) {
      segments[i - 1].end = segments[i + 1].end;
      segments.splice(i, 2);
      i--;
    }
  }
  return segments;
}

function estimateKey(frames: Frame[]): string {
  const chroma = new Float64Array(12);
  let tonalFrames = 0;
  for (const frame of frames) {
    if (!frame.tonal) continue;
    tonalFrames++;
    for (let pc = 0; pc < 12; pc++) chroma[pc] += frame.chroma[pc];
  }
  if (tonalFrames < 5) return '待确认';
  const mean = chroma.reduce((a, b) => a + b, 0) / 12;
  let variance = 0;
  for (let i = 0; i < 12; i++) { chroma[i] -= mean; variance += chroma[i] ** 2; }
  if (variance < 1e-10) return '待确认';
  let best = -Infinity;
  let key = '待确认';
  for (let root = 0; root < 12; root++) {
    for (const minor of [false, true]) {
      const profile = minor ? MINOR_PROFILE : MAJOR_PROFILE;
      const profileMean = profile.reduce((a, b) => a + b, 0) / 12;
      let dot = 0;
      let norm = 0;
      for (let pc = 0; pc < 12; pc++) {
        const value = profile[(pc - root + 12) % 12] - profileMean;
        dot += chroma[pc] * value;
        norm += value * value;
      }
      const score = dot / Math.sqrt(norm * variance);
      if (score > best) { best = score; key = `${NOTES[root]}${minor ? 'm' : ''}`; }
    }
  }
  return best < 0.45 ? '待确认' : key;
}

function estimateBpm(samples: Float32Array, sampleRate: number): number {
  if (samples.length / sampleRate < 5) return 0;
  // A separate short-window envelope avoids quantizing tempo to the chord hop size.
  const blockSize = Math.max(64, Math.round(sampleRate * 0.012));
  const frameRate = sampleRate / blockSize;
  const flux: number[] = [];
  let previousEnergy = 0;
  for (let offset = 0; offset < samples.length; offset += blockSize) {
    let square = 0;
    for (let i = offset; i < Math.min(samples.length, offset + blockSize); i++) square += samples[i] ** 2;
    const energy = Math.sqrt(square / blockSize);
    flux.push(Math.max(0, energy - previousEnergy));
    previousEnergy = energy;
  }
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const envelope = flux.map(value => Math.max(0, value - mean * 0.8));
  const envelopePower = envelope.reduce((a, b) => a + b * b, 0);
  if (envelopePower < 1e-8) return 0;
  // Clear repeated attacks provide a more precise pulse estimate than a
  // potentially half-time autocorrelation maximum. Irregular onsets fall back.
  const threshold = Math.max(...envelope) * 0.45;
  const peaks: number[] = [];
  const minimumSpacing = Math.round(frameRate * 0.2);
  for (let i = 1; i < envelope.length - 1; i++) {
    if (envelope[i] < threshold || envelope[i] < envelope[i - 1] || envelope[i] < envelope[i + 1]) continue;
    const last = peaks.at(-1);
    if (last !== undefined && i - last < minimumSpacing) {
      if (envelope[i] > envelope[last]) peaks[peaks.length - 1] = i;
    } else peaks.push(i);
  }
  if (peaks.length >= 6) {
    const intervals = peaks.slice(1).map((peak, i) => (peak - peaks[i]) / frameRate);
    const average = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const deviation = Math.sqrt(intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length);
    const onsetBpm = 60 / average;
    if (deviation / average < 0.12 && onsetBpm >= 55 && onsetBpm <= 180) return Math.round(onsetBpm);
  }
  let best = 0;
  let bestLag = 0;
  const correlations = new Map<number, number>();
  const minLag = Math.ceil(frameRate * 60 / 180);
  const maxLag = Math.floor(frameRate * 60 / 55);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let normA = 0;
    let normB = 0;
    for (let i = lag; i < envelope.length; i++) {
      sum += envelope[i] * envelope[i - lag];
      normA += envelope[i] ** 2;
      normB += envelope[i - lag] ** 2;
    }
    const correlation = sum / (Math.sqrt(normA * normB) + 1e-12);
    const bpm = 60 * frameRate / lag;
    // A light tempo prior only resolves equivalent metrical levels.
    const prior = Math.exp(-0.15 * Math.log2(bpm / 100) ** 2);
    const score = correlation * prior;
    correlations.set(lag, score);
    if (score > best) { best = score; bestLag = lag; }
  }
  if (best <= 0.2 || !bestLag) return 0;
  // Equivalent half/double metrical levels are common. Prefer the shorter pulse
  // near a normal practice tempo when it has substantial independent evidence.
  let halfLag = Math.round(bestLag / 2);
  for (const lag of [halfLag - 1, halfLag + 1]) {
    if ((correlations.get(lag) ?? 0) > (correlations.get(halfLag) ?? 0)) halfLag = lag;
  }
  const halfEvidence = correlations.get(halfLag) ?? 0;
  if (60 * frameRate / bestLag < 85 && halfLag >= minLag && halfEvidence >= best * 0.7) {
    bestLag = halfLag;
    best = halfEvidence;
  }
  const left = correlations.get(bestLag - 1) ?? best;
  const right = correlations.get(bestLag + 1) ?? best;
  const denominator = left - 2 * best + right;
  const correction = denominator ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator)) : 0;
  return Math.round(60 * frameRate / (bestLag + correction));
}

/** Analyze PCM using spectral peaks, chord templates and Viterbi smoothing. */
export function analyzeSamples(samples: Float32Array, sampleRate: number, options: EngineOptions = {}): AnalysisResult {
  if (!Number.isFinite(sampleRate) || sampleRate < 4000 || sampleRate > 192000) throw new Error('音频采样率无效。');
  if (samples.length === 0) throw new Error('音频中没有可分析的采样。');
  const duration = samples.length / sampleRate;
  if (duration > 600) throw new Error('请选择 10 分钟以内的音频。');
  const windowSize = options.windowSize ?? 8192;
  const hopSize = options.hopSize ?? Math.max(256, Math.round(sampleRate * 0.093));
  if (windowSize < 1024 || (windowSize & (windowSize - 1)) !== 0) throw new Error('分析窗口必须是有效的 2 的幂。');
  const spectrum = new Spectrum(windowSize);
  const previous = new Float64Array(windowSize / 2);
  const frames: Frame[] = [];
  const frameCount = Math.max(1, Math.ceil((samples.length - windowSize / 2) / hopSize));
  for (let index = 0; index < frameCount; index++) {
    frames.push(extractFrame(samples, index * hopSize, sampleRate, spectrum, previous));
    if (index % 32 === 0) options.onProgress?.(index / frameCount * 0.9);
  }
  const states = decodeStates(frames);
  options.onProgress?.(0.95);
  const segments = segmentsFromFrames(frames, states, duration);
  const tonalDuration = segments.filter(segment => segment.chord !== 'N.C.').reduce((total, segment) => total + segment.end - segment.start, 0);
  const warnings = ['这是基于音频频谱的实验性识别草稿，仅识别基础大、小三和弦；七和弦、转位和复杂混音可能需要手动修改。'];
  if (tonalDuration / duration < 0.35) warnings.push('多数片段没有足够的和声证据。N.C. 表示未能判断和弦，请试听或尝试更清晰的录音。');
  const bpm = estimateBpm(samples, sampleRate);
  if (!bpm) warnings.push('节拍不够明确，未填写 BPM；请按试听结果设置练习速度。');
  options.onProgress?.(1);
  return { segments, bpm, key: estimateKey(frames), duration, warnings };
}
