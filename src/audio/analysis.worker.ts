/// <reference lib="webworker" />
import { analyzeSamples } from './engine';

const worker = self as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  try {
    const result = analyzeSamples(event.data.samples, event.data.sampleRate, {
      onProgress(progress) { worker.postMessage({ type: 'progress', progress }); },
    });
    worker.postMessage({ type: 'result', result });
  } catch (error) {
    worker.postMessage({ type: 'error', message: error instanceof Error ? error.message : '音频分析失败。' });
  }
};
