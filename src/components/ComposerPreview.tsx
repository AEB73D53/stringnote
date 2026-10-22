import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pause, Play } from 'lucide-react';
import { trackFromChordPro } from '../lib/io';
import { renderTrackAudio } from '../music/synth';

interface ComposerPreviewProps {
  title: string;
  chordsText: string;
  bpm: number;
}

export default function ComposerPreview({ title, chordsText, bpm }: ComposerPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestNumber = useRef(0);
  const live = useRef(true);
  const objectUrl = useRef('');
  const attempted = useRef(false);
  const renderedInput = useRef<{ chordsText: string; bpm: number } | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('先听一遍，再决定怎么编配。');

  useEffect(() => {
    live.current = true;
    const audio = audioRef.current;
    return () => {
      live.current = false;
      requestNumber.current++;
      audio?.pause();
      audio?.removeAttribute('src');
      audio?.load();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = '';
    };
  }, []);

  useEffect(() => {
    requestNumber.current++;
    renderedInput.current = null;
    const previousUrl = objectUrl.current;
    objectUrl.current = '';
    const audio = audioRef.current;
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load();
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    setAudioUrl('');
    setPreparing(false);
    setPlaying(false);
    setError('');
    setMessage(attempted.current ? '和弦或速度已修改，请重新试听。' : '先听一遍，再决定怎么编配。');
  }, [chordsText, bpm]);

  useEffect(() => {
    if (!audioUrl) return;
    const audio = audioRef.current;
    const currentRequest = requestNumber.current;
    if (!audio) return;
    // Asynchronous rendering can outlive a browser's user activation. Keep the
    // native controls visible if automatic playback needs another click.
    void audio.play().catch(() => {
      if (!live.current || requestNumber.current !== currentRequest || objectUrl.current !== audioUrl) return;
      setPlaying(false);
      setMessage('伴奏已准备好，请点击下方播放器的播放按钮。');
    });
  }, [audioUrl]);

  async function preview() {
    if (preparing) return;
    const audio = audioRef.current;
    if (audioUrl && renderedInput.current?.chordsText === chordsText && renderedInput.current.bpm === bpm) {
      if (!audio) return;
      if (!audio.paused) { audio.pause(); return; }
      audio.currentTime = 0;
      const currentRequest = requestNumber.current;
      void audio.play().catch(() => {
        if (!live.current || requestNumber.current !== currentRequest) return;
        setMessage('请点击下方播放器的播放按钮试听。');
      });
      return;
    }

    const currentRequest = ++requestNumber.current;
    attempted.current = true;
    setPreparing(true);
    setPlaying(false);
    setError('');
    setMessage('正在准备吉他和弦伴奏…');
    try {
      if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240) throw new Error('请将练习速度设为 30–240 BPM 后再试听。');
      const cleanTitle = title.replace(/[{}\r\n]/g, ' ').trim() || '我的练习曲';
      const track = trackFromChordPro(`{title: ${cleanTitle}}\n{tempo: ${Math.round(bpm)}}\n${chordsText}`);
      const blob = await renderTrackAudio(track);
      if (!live.current || currentRequest !== requestNumber.current) return;
      const nextUrl = URL.createObjectURL(blob);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = nextUrl;
      renderedInput.current = { chordsText, bpm };
      setAudioUrl(nextUrl);
      setMessage('伴奏已生成，可以试听当前和弦。');
    } catch (cause) {
      if (!live.current || currentRequest !== requestNumber.current) return;
      setError(cause instanceof Error ? cause.message : '试听伴奏生成失败，请检查和弦后重试。');
      setMessage('修改和弦后，可以再次点击试听。');
    } finally {
      if (live.current && currentRequest === requestNumber.current) setPreparing(false);
    }
  }

  return <section className="composer-preview" aria-label="和弦试听">
    <button type="button" className="button secondary full-width" disabled={preparing} aria-busy={preparing} aria-pressed={playing} onClick={() => { void preview(); }}>
      {preparing ? <LoaderCircle size={17} className="spin" /> : playing ? <Pause size={17} /> : <Play size={17} />}
      {preparing ? '正在生成伴奏…' : playing ? '暂停试听' : audioUrl ? '重新试听和弦' : '试听和弦'}
    </button>
    <p className="muted small">木吉他音色 · 分解拨弦与轻扫弦，不含人声。<br />
      <a href={`${import.meta.env.BASE_URL}audio/LICENSE.md`} target="_blank" rel="noopener noreferrer">音色来源与许可</a>
    </p>
    <audio
      ref={audioRef}
      controls
      preload="metadata"
      src={audioUrl || undefined}
      hidden={!audioUrl}
      aria-label="和弦试听播放器"
      style={{ width: '100%' }}
      onPlay={() => {
        if (!live.current || !objectUrl.current) return;
        setPlaying(true);
        setMessage('正在试听当前和弦。');
      }}
      onPause={() => {
        if (!live.current) return;
        setPlaying(false);
        if (objectUrl.current) setMessage('试听已暂停，可以重新播放。');
      }}
      onEnded={() => {
        if (!live.current || !objectUrl.current) return;
        setPlaying(false);
        setMessage('试听结束，可以修改和弦后再听一遍。');
      }}
      onError={() => {
        if (!live.current || !objectUrl.current) return;
        const previousUrl = objectUrl.current;
        objectUrl.current = '';
        renderedInput.current = null;
        URL.revokeObjectURL(previousUrl);
        setAudioUrl('');
        setPlaying(false);
        setError('浏览器无法播放这份试听伴奏，请重新生成。');
      }}
    />
    <p className="muted small" role="status" aria-live="polite">{message}</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
  </section>;
}
