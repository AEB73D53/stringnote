import type { AnalysisProgress, AnalysisResult } from '../types';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_DURATION = 600;
const SAMPLE_RATE = 22050;

function abortError(): DOMException { return new DOMException('分析已取消。', 'AbortError'); }
function checkAborted(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }

async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  let abort: () => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

export async function decodeAudioFile(file: File, signal?: AbortSignal): Promise<{ samples: Float32Array; sampleRate: number; duration: number }> {
  checkAborted(signal);
  if (file.size > MAX_FILE_SIZE) throw new Error('音频不能超过 50 MB，请裁剪后再试。');
  if (file.size < 44) throw new Error('文件为空或不是有效音频，请重新选择。');
  if (!/\.(mp3|wav|wave)$/i.test(file.name)) throw new Error('请选择 MP3 或 WAV 音频文件。');
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error('当前浏览器不支持音频解码，请使用新版 Chrome、Edge 或 Safari。');
  const context = new Context({ sampleRate: SAMPLE_RATE });
  try {
    const buffer = await abortable(file.arrayBuffer(), signal);
    checkAborted(signal);
    let audio: AudioBuffer;
    try { audio = await abortable(context.decodeAudioData(buffer), signal); }
    catch {
      checkAborted(signal);
      throw new Error('无法读取这段音频。请确认文件未损坏，或转成 MP3/WAV 后重试。');
    }
    checkAborted(signal);
    if (audio.duration > MAX_DURATION) throw new Error('请选择 10 分钟以内的音频，或先截取想练习的片段。');
    if (audio.duration < 0.5) throw new Error('音频太短，请至少选择半秒以上的录音。');
    const samples = new Float32Array(audio.length);
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const data = audio.getChannelData(channel);
      for (let i = 0; i < data.length; i++) samples[i] += data[i] / audio.numberOfChannels;
    }
    return { samples, sampleRate: audio.sampleRate, duration: audio.duration };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** User audio stays on-device. The caller must revoke audioUrl when no longer used. */
export async function analyzeAudioFile(
  file: File,
  onProgress?: (progress: AnalysisProgress) => void,
  signal?: AbortSignal,
): Promise<{ result: AnalysisResult; audioUrl: string }> {
  checkAborted(signal);
  onProgress?.({ stage: '正在本机读取音频', progress: 0.02 });
  const { samples, sampleRate } = await decodeAudioFile(file, signal);
  checkAborted(signal);
  onProgress?.({ stage: '正在分析和弦', progress: 0.1 });
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
    let done = false;
    const cleanUp = () => {
      done = true;
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => { if (!done) { cleanUp(); reject(abortError()); } };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    worker.onmessage = (event: MessageEvent<{ type: string; progress?: number; result?: AnalysisResult; message?: string }>) => {
      if (done) return;
      if (event.data.type === 'progress') {
        onProgress?.({ stage: (event.data.progress ?? 0) > 0.9 ? '正在整理和弦草稿' : '正在分析和弦', progress: 0.1 + (event.data.progress ?? 0) * 0.9 });
      } else if (event.data.type === 'result' && event.data.result) {
        cleanUp();
        const audioUrl = URL.createObjectURL(file);
        onProgress?.({ stage: '和弦草稿已生成', progress: 1 });
        resolve({ result: event.data.result, audioUrl });
      } else if (event.data.type === 'error') {
        cleanUp();
        reject(new Error(event.data.message ?? '分析失败，请换一段录音重试。'));
      }
    };
    worker.onerror = () => { if (!done) { cleanUp(); reject(new Error('音频分析进程未能完成，请刷新页面后重试。')); } };
    worker.postMessage({ samples, sampleRate }, [samples.buffer]);
  });
}
