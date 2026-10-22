/** The small, self-hosted sound bank is loaded only when a preview is needed. */
export interface GuitarSample {
  midi: number;
  samples: Float32Array;
  sampleRate: number;
}

let bankPromise: Promise<GuitarSample[] | null> | null = null;
let retryAfter = 0;

async function decodeBank(): Promise<GuitarSample[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}audio/acoustic-guitar.json`, { signal: controller.signal });
    if (!response.ok) throw new Error('Guitar sound bank unavailable');
    const bank: { samples: { midi: number; data: string }[] } = await response.json();
    if (!Array.isArray(bank.samples) || !bank.samples.length || bank.samples.length > 64) throw new Error('Invalid sound bank');
    const context = new OfflineAudioContext(1, 1, 22050);
    return await Promise.all(bank.samples.map(async entry => {
      if (!Number.isInteger(entry.midi) || entry.midi < 24 || entry.midi > 108
        || !/^data:audio\/(?:mp3|mpeg);base64,/.test(entry.data)) throw new Error('Invalid guitar sample');
      const binary = atob(entry.data.slice(entry.data.indexOf(',') + 1));
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const audio = await context.decodeAudioData(bytes.buffer);
      if (audio.duration <= 0 || audio.duration > 12) throw new Error('Invalid guitar sample duration');
      const samples = new Float32Array(audio.length);
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        const data = audio.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] += data[i] / audio.numberOfChannels;
      }
      // MP3 encoders can leave a short lead-in. Keep the pick attack but remove
      // actual silence so a downstroke still aligns with the chord timeline.
      let first = 0;
      while (first < samples.length && Math.abs(samples[first]) < 0.001) first++;
      const onset = Math.max(0, first - Math.round(audio.sampleRate * 0.001));
      return { midi: entry.midi, samples: samples.slice(onset), sampleRate: audio.sampleRate };
    }));
  } finally {
    clearTimeout(timeout);
  }
}

/** If samples cannot load, the renderer can still play its local string model. */
export function loadGuitarSamples(): Promise<GuitarSample[] | null> {
  if (typeof OfflineAudioContext === 'undefined' || Date.now() < retryAfter) return Promise.resolve(null);
  bankPromise ??= decodeBank().catch(() => {
    bankPromise = null;
    retryAfter = Date.now() + 30_000;
    return null;
  });
  return bankPromise;
}
