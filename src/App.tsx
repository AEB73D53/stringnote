import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, AudioLines, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, ExternalLink, FileImage, FileMusic, FolderOpen, Guitar, Headphones, HelpCircle, Library, LoaderCircle, Menu, Minus, Music2, Pause, Pencil, Play, Plus, Repeat2, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles, Timer, Trash2, Upload, Volume2, X } from 'lucide-react';
import type { AnalysisProgress, PracticeTrack } from './types';
import { PRACTICE_TRACKS } from './music/catalog';
import { formatTime, getChordShape, getEasyCapo, parseChord, transposeChord } from './music/theory';
import { renderTrackAudio } from './music/synth';
import { resolveAudioKind, synthesisSignature, trackForSynthesis } from './music/preview';
import ComposerPreview from './components/ComposerPreview';
import { toChordPro, toJson } from './music/exporters';
import { analyzeAudioFile } from './audio';
import { getLibrary, removePractice, savePractice } from './lib/storage';
import type { SavedPractice } from './lib/storage';
import { downloadFile, importTrack, trackFromChordPro } from './lib/io';
import { searchSongVersions } from './lib/songSearch';
import type { SongVersion } from './lib/songSearch';

type View = 'discover' | 'library' | 'chords' | 'practice';
type ModalType = 'upload' | 'compose' | 'help' | 'export' | null;
const USER_GUIDE_URL = 'https://github.com/AEB73D53/stringnote/blob/main/USER_GUIDE.md';
const DICTIONARY = ['C', 'G', 'Am', 'F', 'Dm', 'Em', 'D', 'E', 'A', 'Bm', 'D7', 'G7', 'Cmaj7', 'Am7', 'Fmaj7', 'Dsus4'];

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-symbol" aria-hidden="true"><svg viewBox="0 0 36 36"><path d="M10 7v22M15.5 7v22M21 7v22M26.5 7v22M7 13c7 7 15-7 22 0M7 22c7 7 15-7 22 0" /></svg></span>{!compact && <span>弦记<span className="brand-english">STRINGNOTE</span></span>}</div>;
}

function Modal({ children, title, onClose, wide = false }: { children: ReactNode; title: string; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = before; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? 'modal-wide' : ''}`} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Tab') {
      const items = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href]');
      if (!items?.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭对话框" onClick={onClose}><X size={20} /></button></div>{children}</div></div>;
}

function ChordDiagram({ chord, large = false }: { chord: string; large?: boolean }) {
  const shape = getChordShape(chord);
  if (!shape) return <div className={`chord-diagram unknown ${large ? 'large' : ''}`}><strong>{chord}</strong><span>{chord === 'N.C.' ? '暂不弹奏' : '此指法暂未收录'}</span></div>;
  const base = shape.baseFret ?? 1;
  return <div className={`chord-diagram ${large ? 'large' : ''}`}><strong>{chord}</strong><svg viewBox="0 0 112 132" role="img" aria-label={`${chord} 和弦指法，六弦至一弦 ${shape.frets.map(f => f < 0 ? '不弹' : f === 0 ? '空弦' : `${f}品`).join('、')}`}>
    {base > 1 && <text x="2" y="37" className="fret-number">{base}</text>}
    {Array.from({ length: 6 }, (_, i) => <line key={`s${i}`} x1={23 + i * 14} x2={23 + i * 14} y1="24" y2="110" stroke="currentColor" strokeWidth={1.1 - i * 0.08} opacity=".42" />)}
    {Array.from({ length: 6 }, (_, i) => <line key={`f${i}`} x1="23" x2="93" y1={24 + i * 17.2} y2={24 + i * 17.2} stroke="currentColor" opacity={i === 0 && base === 1 ? '.9' : '.25'} strokeWidth={i === 0 && base === 1 ? 3 : 1} />)}
    {shape.frets.map((fret, i) => fret === 0 ? <circle key={i} cx={23 + i * 14} cy="12" r="3.1" stroke="currentColor" fill="none" /> : fret < 0 ? <text key={i} x={23 + i * 14} y="15" textAnchor="middle" fontSize="12" fill="currentColor">×</text> : <circle key={i} cx={23 + i * 14} cy={24 + (fret - base + .5) * 17.2} r="5.2" fill="currentColor" />)}
    {shape.barre && <line x1={23 + shape.barre.from * 14} x2={23 + shape.barre.to * 14} y1={24 + (shape.barre.fret - base + .5) * 17.2} y2={24 + (shape.barre.fret - base + .5) * 17.2} stroke="currentColor" strokeWidth="9" strokeLinecap="round" />}
    <text x="23" y="128" fontSize="9" fill="currentColor" opacity=".5">E</text><text x="89" y="128" fontSize="9" fill="currentColor" opacity=".5">e</text>
  </svg></div>;
}

function TrackArt({ color, variant = 0 }: { color: string; variant?: number }) {
  return <div className={`track-art ${color}`} aria-hidden="true"><svg viewBox="0 0 320 190">
    {variant % 3 === 0 ? <><circle cx="220" cy="65" r="27" fill="currentColor" opacity=".12" /><path d="M-15 153Q60 93 147 142T340 103M-15 168Q73 113 152 159T340 123" fill="none" stroke="currentColor" strokeWidth="1.3" opacity=".22" /><g transform="translate(146 90) rotate(-28)"><path d="M-11-31C-12-51-39-54-43-31c-4 14 5 20 0 30-12 23 0 40 21 40S12 20 0-1c-6-11 3-18 0-30Z" fill="currentColor" opacity=".8" /><rect x="-28" y="-87" width="12" height="68" rx="3" fill="currentColor" opacity=".8" /><circle cx="-22" cy="2" r="9" fill="white" opacity=".72" /><path d="M-25-84V22M-22-84V22M-19-84V22" stroke="white" opacity=".6" strokeWidth=".6" /><path d="M-34 23h24" stroke="white" strokeWidth="4" opacity=".7" /></g><path d="M65 53v24m-6-12h12M252 130v14m-7-7h14" stroke="currentColor" strokeWidth="1.5" opacity=".4" /></> : variant % 3 === 1 ? <><circle cx="160" cy="94" r="61" fill="none" stroke="currentColor" opacity=".2" /><circle cx="160" cy="94" r="46" fill="none" stroke="currentColor" opacity=".3" /><circle cx="160" cy="94" r="31" fill="currentColor" opacity=".75" /><circle cx="160" cy="94" r="7" fill="white" opacity=".8" /><path d="m60 40 3 9 9 3-9 3-3 9-3-9-9-3 9-3ZM253 111l3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="currentColor" opacity=".5" /><path d="M218 26h27v67c-15 18-36 3-24-9 7-6 14-4 17-3V40h-20Z" fill="currentColor" opacity=".55" /></> : <><path d="M-5 139c35-68 77 51 117-11s59 38 96-27 73 6 117-32" fill="none" stroke="currentColor" strokeWidth="2" opacity=".35" /><circle cx="163" cy="76" r="37" fill="currentColor" opacity=".2" /><path d="M130 133V57l59-12v75M130 74l59-12" fill="none" stroke="currentColor" strokeWidth="5" /><ellipse cx="119" cy="134" rx="16" ry="11" fill="currentColor" /><ellipse cx="178" cy="120" rx="16" ry="11" fill="currentColor" /><path d="M52 65h20m-10-10v20M262 145h14m-7-7v14" stroke="currentColor" opacity=".4" /></>}
    <text x="22" y="169" fontSize="9" letterSpacing="3" fill="currentColor" opacity=".55">STRINGNOTE SESSIONS</text>
  </svg></div>;
}

function TrackCard({ track, index, saved, onOpen, onSave }: { track: PracticeTrack; index: number; saved: boolean; onOpen: () => void; onSave: () => void }) {
  return <article className="track-card"><button className="track-cover-button" onClick={onOpen} aria-label={`开始练习${track.title}`}><TrackArt color={track.color} variant={index} /><span className="cover-label">{track.sourceKind === 'original' ? '原创练习' : track.sourceKind === 'public-domain' ? '经典旋律 · 自编配' : '我的编配'}</span><span className="cover-play"><Play size={18} fill="currentColor" /></span></button><div className="track-content"><div className="track-title-row"><button className="text-button track-title" onClick={onOpen}>{track.title}</button><button className={`icon-button bookmark ${saved ? 'is-saved' : ''}`} aria-label={saved ? `取消收藏${track.title}` : `收藏${track.title}`} onClick={onSave}><Bookmark size={18} fill={saved ? 'currentColor' : 'none'} /></button></div><p>{track.artist}</p><div className="track-meta"><span className={`level ${track.difficulty === '入门' ? 'easy' : ''}`}>{track.difficulty}</span><span>{track.key} 调</span><span>{track.bpm || '—'} BPM</span><span>{formatTime(track.duration)}</span></div></div></article>;
}

export default function App() {
  const [view, setView] = useState<View>('discover');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [library, setLibrary] = useState<SavedPractice[]>([]);
  const [activeTrack, setActiveTrack] = useState<PracticeTrack | null>(null);
  const [originalTrack, setOriginalTrack] = useState<PracticeTrack | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | undefined>();
  const [originalAudioBlob, setOriginalAudioBlob] = useState<Blob | undefined>();
  const [audioKind, setAudioKind] = useState<'original' | 'synthesized'>('synthesized');
  const [synthSignature, setSynthSignature] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | undefined>();
  const [imageZoom, setImageZoom] = useState(100);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [songVersions, setSongVersions] = useState<SongVersion[]>([]);
  const [searchingVersions, setSearchingVersions] = useState(false);
  const [versionSearchError, setVersionSearchError] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<SongVersion | null>(null);
  const [filter, setFilter] = useState('全部');
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(.75);
  const [metronome, setMetronome] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(0);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editChord, setEditChord] = useState('');
  const [editStart, setEditStart] = useState('');
  const [history, setHistory] = useState<PracticeTrack[]>([]);
  const [composeName, setComposeName] = useState('我的练习曲');
  const [composeText, setComposeText] = useState('C Am F G\nC Am Dm G');
  const [composeBpm, setComposeBpm] = useState(84);
  const [dictionaryChord, setDictionaryChord] = useState('C');
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingPlayback = useRef<{ url: string; position: number } | null>(null);
  const metronomeContext = useRef<AudioContext | null>(null);
  const lastBeat = useRef(-1);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const cancelAnalysis = useRef<AbortController | null>(null);
  const openVersion = useRef(0);
  const workingTrack = useRef(activeTrack);
  workingTrack.current = activeTrack;
  const currentTranspose = useRef(transpose);
  currentTranspose.current = transpose;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3800);
  }, []);
  const refreshLibrary = useCallback(() => getLibrary().then(setLibrary).catch(e => notify(e.message)), [notify]);
  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);
  useEffect(() => {
    setSelectedVersion(null); setSongVersions([]); setVersionSearchError('');
    if (!searched) { setSearchingVersions(false); return; }
    const controller = new AbortController(); setSearchingVersions(true);
    void searchSongVersions(searched, controller.signal).then(versions => {
      if (!controller.signal.aborted) setSongVersions(versions);
    }).catch(e => { if (!controller.signal.aborted) setVersionSearchError((e as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setSearchingVersions(false); });
    return () => controller.abort();
  }, [searched]);
  useEffect(() => () => { clearTimeout(toastTimer.current); cancelAnalysis.current?.abort(); void metronomeContext.current?.close(); }, []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => {
    if (modal === 'compose') {
      ++openVersion.current; pendingPlayback.current = null; setLoadingTrack(false);
      audioRef.current?.pause();
    }
  }, [modal]);
  useEffect(() => {
    if (activeTrack && audioKind === 'synthesized' && synthSignature && synthSignature !== synthesisSignature(activeTrack, transpose)) {
      pendingPlayback.current = null;
      audioRef.current?.pause(); setPlaying(false);
    }
  }, [activeTrack, transpose, audioKind, synthSignature]);

  const navigate = useCallback((next: View) => {
    setView(next); setSidebarOpen(false); setError('');
    if (next !== 'practice') { ++openVersion.current; pendingPlayback.current = null; setLoadingTrack(false); audioRef.current?.pause(); setPlaying(false); }
    window.location.hash = next;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const readHash = () => {
      const name = window.location.hash.slice(1).split('?')[0];
      if (name === 'library' || name === 'chords' || name === 'discover') setView(name);
      if (name === 'practice') setView(workingTrack.current ? 'practice' : 'discover');
    };
    readHash(); window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);

  useEffect(() => { if (audioRef.current) { audioRef.current.playbackRate = speed; audioRef.current.volume = volume; } }, [speed, volume, audioUrl]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const update = () => {
      const audio = audioRef.current;
      if (audio) {
        if (loop && audio.currentTime >= loop.end) audio.currentTime = loop.start;
        setCurrentTime(audio.currentTime);
        const beat = Math.floor(audio.currentTime * (activeTrack?.bpm || 84) / 60);
        if (beat !== lastBeat.current) {
          lastBeat.current = beat;
          const context = metronomeContext.current;
          if (metronome && context?.state === 'running') {
            const oscillator = context.createOscillator(), gain = context.createGain();
            oscillator.frequency.value = beat % (activeTrack?.timeSignature || 4) === 0 ? 1200 : 800;
            gain.gain.setValueAtTime(.075, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .045);
            oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .05);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          }
        }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, metronome, activeTrack?.bpm, activeTrack?.timeSignature]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || view !== 'practice' || modal || editing !== null || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((event.target as HTMLElement).tagName)) return;
      event.preventDefault();
      void togglePlayback();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  async function openTrack(track: PracticeTrack, existing?: SavedPractice) {
    cancelAnalysis.current?.abort();
    const version = ++openVersion.current;
    audioRef.current?.pause(); setPlaying(false); setCurrentTime(0); setTranspose(0); setCapo(0); setLoop(null); setLoopStart(null); setHistory([]); setAnalysisWarnings([]); setError('');
    pendingPlayback.current = null;
    setAudioUrl(''); setImageUrl(''); setAudioBlob(undefined); setOriginalAudioBlob(undefined); setSynthSignature(''); setImageBlob(undefined);
    setActiveTrack(structuredClone(track)); setOriginalTrack(structuredClone(track)); setDuration(track.duration); navigate('practice'); setLoadingTrack(true);
    try {
      if (existing?.image) { setImageBlob(existing.image); setImageUrl(URL.createObjectURL(existing.image)); setImageZoom(100); return; }
      const kind = existing?.audio ? resolveAudioKind(existing) : 'synthesized';
      const blob = kind === 'original' && existing?.audio ? existing.audio : await renderTrackAudio(track);
      if (version !== openVersion.current) return;
      setAudioKind(kind); setOriginalAudioBlob(kind === 'original' ? blob : undefined);
      setSynthSignature(kind === 'synthesized' ? synthesisSignature(track) : '');
      setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob));
      if (track.sourceKind === 'user' && kind === 'synthesized') notify('伴奏已准备好，点击上方“试听和弦”听效果');
    } catch (e) { setError(e instanceof Error ? e.message : '音频准备失败，请重试。'); }
    finally { if (version === openVersion.current) setLoadingTrack(false); }
  }

  async function toggleSaved(track: PracticeTrack) {
    const record = library.find(item => item.id === track.id);
    try {
      if (record) { await removePractice(track.id); notify('已从本机谱库移除'); }
      else { await savePractice({ id: track.id, track, updatedAt: Date.now() }); notify('已收藏到本机谱库'); }
      await refreshLibrary();
    } catch (e) { notify((e as Error).message); }
  }

  async function saveActive() {
    if (!activeTrack) return;
    const validSynthesis = audioKind === 'synthesized' && synthSignature === synthesisSignature(activeTrack);
    try { await savePractice({ id: activeTrack.id, track: activeTrack, audio: originalAudioBlob ?? (validSynthesis ? audioBlob : undefined), audioKind: originalAudioBlob ? 'original' : 'synthesized', synthSignature: originalAudioBlob ? undefined : validSynthesis ? synthSignature : undefined, image: imageBlob, updatedAt: Date.now() }); await refreshLibrary(); notify('曲谱已保存到本机，原录音和试听编配分别保留'); }
    catch (e) { notify((e as Error).message); }
  }

  async function analyze(file: File) {
    if (cancelAnalysis.current) return;
    setModal('upload'); setError(''); setProgress({ stage: '读取音频', progress: 0 });
    const controller = new AbortController(); cancelAnalysis.current = controller;
    const version = ++openVersion.current; setLoadingTrack(false);
    try {
      const { result, audioUrl: url } = await analyzeAudioFile(file, state => { if (cancelAnalysis.current === controller && !controller.signal.aborted) setProgress(state); }, controller.signal);
      if (controller.signal.aborted || cancelAnalysis.current !== controller || version !== openVersion.current) { URL.revokeObjectURL(url); return; }
      const track: PracticeTrack = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), artist: '本机音频 · 识别草稿', description: '实验性频谱和弦识别，请试听核对后使用。', sourceKind: 'user', bpm: result.bpm, key: result.key, timeSignature: 4, duration: result.duration, segments: result.segments, color: 'lavender', difficulty: '待确认', tags: ['识别草稿'], createdAt: Date.now() };
      pendingPlayback.current = null;
      setAudioKind('original'); setOriginalAudioBlob(file); setSynthSignature('');
      setLoadingTrack(false); audioRef.current?.pause(); setActiveTrack(track); setOriginalTrack(structuredClone(track)); setAudioUrl(url); setAudioBlob(file); setImageUrl(''); setImageBlob(undefined); setDuration(result.duration); setCurrentTime(0); setPlaying(false); setTranspose(0); setCapo(0); setLoop(null); setLoopStart(null); setHistory([]); setAnalysisWarnings(result.warnings); setModal(null); navigate('practice'); notify('分析完成，请试听并核对和弦');
    } catch (e) { if (cancelAnalysis.current === controller) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '音频分析失败，请尝试其他文件。'); else notify('已取消分析'); } }
    finally { if (cancelAnalysis.current === controller) { setProgress(null); cancelAnalysis.current = null; if (fileRef.current) fileRef.current.value = ''; } }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const track = importTrack(await file.text(), file.name);
      await savePractice({ id: track.id, track, updatedAt: Date.now() }); await refreshLibrary(); setModal(null); await openTrack(track); notify('已导入曲谱');
    } catch (e) { notify(`导入失败：${(e as Error).message}`); }
    finally { event.target.value = ''; }
  }

  async function importImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 15 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { notify('请选择 15 MB 以内的 PNG、JPG 或 WebP 图片。'); event.target.value = ''; return; }
    try { const bitmap = await createImageBitmap(file); bitmap.close(); }
    catch { notify('无法读取这张图片，请确认文件未损坏。'); event.target.value = ''; return; }
    const track: PracticeTrack = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), artist: '我的图片谱', description: '图片谱支持缩放查看，移调和编辑需要结构化和弦谱。', sourceKind: 'user', bpm: 0, key: '未知', timeSignature: 4, duration: 0, segments: [], color: 'peach', difficulty: '待确认', tags: ['图片谱'], createdAt: Date.now() };
    const record = { id: track.id, track, image: file, updatedAt: Date.now() };
    try { await savePractice(record); await refreshLibrary(); await openTrack(track, record); setModal(null); notify('图片谱已保存到本机'); } catch (e) { notify((e as Error).message); }
    event.target.value = '';
  }

  function createTrack() {
    try { const track = trackFromChordPro(`{title: ${composeName.replace(/[{}]/g, '')}}\n{tempo: ${composeBpm}}\n${composeText}`); setModal(null); void openTrack(track); }
    catch (e) { setError((e as Error).message); }
  }

  function playReadyAudio(audio: HTMLAudioElement) {
    void audio.play().catch(() => notify('试听已准备好，请再点击一次播放按钮开始。'));
  }

  function handleAudioReady() {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration); audio.playbackRate = speed; audio.volume = volume;
    if (pendingPlayback.current?.url === audio.src) {
      const { position } = pendingPlayback.current; pendingPlayback.current = null;
      if (audioKind === 'synthesized' && (!workingTrack.current || synthSignature !== synthesisSignature(workingTrack.current, currentTranspose.current))) return;
      audio.currentTime = Math.min(position, Math.max(0, audio.duration - .05));
      playReadyAudio(audio);
    }
  }

  async function auditionChords() {
    if (!activeTrack || loadingTrack) return;
    const signature = synthesisSignature(activeTrack, transpose);
    const audio = audioRef.current;
    if (audioKind === 'synthesized' && synthSignature === signature && audioUrl && audio) {
      if (!audio.paused) { audio.pause(); return; }
      if (audio.currentTime >= duration - .05) audio.currentTime = loop?.start ?? 0;
      playReadyAudio(audio); return;
    }
    const snapshot = structuredClone(activeTrack), semitones = transpose;
    const version = ++openVersion.current;
    audio?.pause(); setPlaying(false); setLoadingTrack(true); setError('');
    try {
      const blob = await renderTrackAudio(trackForSynthesis(snapshot, semitones));
      if (version !== openVersion.current || !workingTrack.current || synthesisSignature(workingTrack.current, currentTranspose.current) !== signature) return;
      const url = URL.createObjectURL(blob);
      pendingPlayback.current = { url, position: loop?.start ?? 0 };
      setAudioKind('synthesized'); setSynthSignature(signature); setAudioBlob(blob); setAudioUrl(url); setCurrentTime(loop?.start ?? 0);
    } catch (e) { if (version === openVersion.current) setError(e instanceof Error ? e.message : '试听准备失败，请重试。'); }
    finally { if (version === openVersion.current) setLoadingTrack(false); }
  }

  function auditionOriginal() {
    if (!originalAudioBlob || loadingTrack) return;
    const audio = audioRef.current;
    if (audioKind === 'original' && audio) {
      if (!audio.paused) audio.pause(); else playReadyAudio(audio);
      return;
    }
    ++openVersion.current; audio?.pause();
    const url = URL.createObjectURL(originalAudioBlob);
    pendingPlayback.current = { url, position: Math.min(currentTime, duration - .05) };
    setAudioKind('original'); setSynthSignature(''); setAudioBlob(originalAudioBlob); setAudioUrl(url);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || loadingTrack) return;
    if (!audio.paused) { audio.pause(); return; }
    if (audioKind === 'synthesized') await auditionChords();
    else { if (audio.currentTime >= duration - .05) audio.currentTime = loop?.start ?? 0; playReadyAudio(audio); }
  }

  function seek(time: number) {
    const next = Math.max(0, Math.min(duration, time));
    if (audioRef.current) audioRef.current.currentTime = next;
    setCurrentTime(next);
  }

  function updateTrack(next: PracticeTrack) {
    if (activeTrack) setHistory(previous => [...previous.slice(-19), structuredClone(activeTrack)]);
    setActiveTrack(next);
  }

  function applyEdit() {
    if (!activeTrack || editing === null) return;
    const chord = editChord.trim();
    if (!parseChord(chord) && chord !== 'N.C.') { setError('请输入有效和弦，例如 C、Am、Fmaj7 或 N.C.。'); return; }
    const start = Number(editStart);
    const segment = activeTrack.segments[editing];
    const previous = activeTrack.segments[editing - 1];
    if (!Number.isFinite(start) || start < 0 || start >= segment.end || (!previous && start !== 0) || (previous && start <= previous.start)) { setError('换和弦时间需位于上一段起点与当前段终点之间；第一段从 0 秒开始。'); return; }
    const next = structuredClone(activeTrack); next.segments[editing].chord = chord; next.segments[editing].start = start;
    if (previous) next.segments[editing - 1].end = start;
    updateTrack(next); setEditing(null); setError(''); notify(originalAudioBlob ? '和弦已修改，点击“试听和弦”听编配，原录音保留' : '和弦已修改，点击“试听和弦”听最新效果');
  }

  const activeIndex = activeTrack ? activeTrack.segments.findIndex((segment, index) => currentTime >= segment.start && (currentTime < segment.end || (currentTime >= duration && index === activeTrack.segments.length - 1))) : -1;
  const activeSegment = activeTrack?.segments[activeIndex];
  const displayChord = (chord: string) => transposeChord(chord, transpose - capo);
  const visibleChords = activeTrack ? [...new Set(activeTrack.segments.map(s => displayChord(s.chord)))].filter(c => c !== 'N.C.') : [];
  const foundTracks = PRACTICE_TRACKS.filter(track => (!searched || `${track.title} ${track.artist} ${track.tags.join(' ')}`.toLowerCase().includes(searched.toLowerCase())) && (filter === '全部' || (filter === '入门友好' ? track.difficulty === '入门' : track.sourceKind === 'original')));
  const saved = (id: string) => library.some(record => record.id === id);
  const synthesisOutdated = !!activeTrack && audioKind === 'synthesized' && synthSignature !== synthesisSignature(activeTrack, transpose);

  function renderExternalSearch() {
    if (!searched) return null;
    const sourceQuery = selectedVersion ? `${selectedVersion.title} ${selectedVersion.artist}` : searched;
    const sites = [{ name: '吉他社', domain: 'jitashe.org', subtitle: '吉他谱与弹唱编配' }, { name: '吉他帮', domain: 'jitabang.com', subtitle: '流行歌曲与指弹谱' }, { name: '全网找谱', domain: '', subtitle: '搜索更多曲谱来源' }];
    return <><section className="version-results"><div className="section-heading"><div><h2>先确认，你想弹哪个版本？</h2><p>歌曲信息来自 Apple 曲库，选择版本后再找对应曲谱。</p></div><span className="subtle-label">歌曲版本</span></div>{searchingVersions ? <div className="version-loading" role="status"><LoaderCircle size={16} className="spin" />正在查找歌曲版本…</div> : songVersions.length ? <div className="song-version-list">{songVersions.map(version => <div className={`song-version ${selectedVersion?.id === version.id ? 'selected' : ''}`} key={version.id}><span className="song-version-icon"><Music2 size={19} /></span><div><strong>{version.title}<a href={version.url} target="_blank" rel="noopener noreferrer" aria-label={`在 Apple 查看${version.title}`}><ExternalLink size={12} /></a></strong><small>{version.artist} · {version.album}</small></div><button className="button secondary" onClick={() => setSelectedVersion(version)}>{selectedVersion?.id === version.id ? <><Check size={13} />已选择</> : <>找这个版本的谱 <ArrowRight size={13} /></>}</button></div>)}</div> : <div className="version-fallback"><Music2 size={17} /><span>{versionSearchError || '没有查到对应歌曲版本，仍可在下方按关键词找谱，或直接导入音频。'}</span></div>}</section><section className="external-results"><div className="section-heading"><div><h2>去找「{sourceQuery}」的谱</h2><p>在原站搜索并确认曲谱，找到的图片谱可以导入这里练习。</p></div><span className="subtle-label">站外搜索</span></div><div className="source-grid">{sites.map(site => <a className="source-card" key={site.name} href={`https://www.bing.com/search?q=${encodeURIComponent(`${site.domain ? `site:${site.domain} ` : ''}${sourceQuery} 吉他谱`)}`} target="_blank" rel="noopener noreferrer"><span className="source-icon"><FileMusic size={22} /></span><span><strong>{site.name}</strong><small>{site.subtitle}</small></span><ExternalLink size={16} /></a>)}</div><p className="source-note"><ExternalLink size={13} />以上是搜索入口，尚未确认这些网站已收录该歌曲。</p></section></>;
  }

  return <div className="app-shell">
    <input ref={fileRef} className="visually-hidden" tabIndex={-1} type="file" accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" aria-label="选择音频文件" onChange={e => { const file = e.target.files?.[0]; if (file) void analyze(file); }} />
    <input ref={importRef} className="visually-hidden" tabIndex={-1} type="file" accept=".json,.cho,.chopro,.pro,.txt" aria-label="选择和弦谱文件" onChange={e => { void importFile(e); }} />
    <input ref={imageRef} className="visually-hidden" tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择图片谱" onChange={e => { void importImage(e); }} />
    {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}><a className="brand-link" href="#discover" onClick={() => navigate('discover')} aria-label="弦记首页"><Logo /></a><div className="nav-label">你的音乐空间</div><nav aria-label="主要导航"><button className={`nav-item ${view === 'discover' ? 'active' : ''}`} onClick={() => navigate('discover')}><Compass size={20} /><span>发现与练习</span></button><button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => navigate('library')}><Library size={20} /><span>我的曲谱</span>{library.length > 0 && <span className="nav-count">{library.length}</span>}</button><button className={`nav-item ${view === 'chords' ? 'active' : ''}`} onClick={() => navigate('chords')}><Guitar size={20} /><span>和弦字典</span></button>{activeTrack && <button className={`nav-item ${view === 'practice' ? 'active' : ''}`} onClick={() => navigate('practice')}><Headphones size={20} /><span>继续练习</span><span className="nav-live" /></button>}</nav><div className="sidebar-note"><div className="note-icon"><Music2 size={19} /></div><strong>每天，和音乐近一点。</strong><p>不用一次弹好整首歌。<br />今天先从一个和弦开始。</p><button className="text-button" onClick={() => { setModal('compose'); setError(''); }}>写下我的和弦 <ArrowRight size={14} /></button></div><div className="sidebar-bottom"><button className="nav-item" onClick={() => setModal('help')}><HelpCircle size={19} /><span>使用指南</span></button><div className="local-workspace"><span className="status-dot" /><span>本机工作区<small>你的音频，留在你的设备</small></span><ShieldCheck size={17} /></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button><span>工作区</span><ChevronRight size={14} /><strong>{({ discover: '发现与练习', library: '我的曲谱', chords: '和弦字典', practice: '练习工作台' })[view]}</strong></div><div className="topbar-right"><span><span className="tiny-dot" />为每一次想弹琴的你</span><button className="workspace-avatar" aria-label="本机工作区说明" onClick={() => setModal('help')}><Music2 size={18} /></button></div></header>
    <main id="main-content">
      {view === 'discover' && <div className="page discover-page"><section className="hero"><div className="hero-copy"><span className="eyebrow"><span />把喜欢，弹成日常</span><h1>让喜欢的歌，<br />落在<span>你的指尖。</span></h1><p>找一首想弹的歌，或让一段音频变成和弦。<br />从第一个和弦，到完整的一次弹唱。</p><div className="hero-badges"><span><Guitar size={14} />吉他弹唱</span><span><ShieldCheck size={14} />音频本机分析</span></div></div><div className="hero-score" aria-hidden="true"><div className="score-sheet"><span className="score-kicker">A LITTLE PRACTICE, EVERY DAY</span><div className="score-chords"><span>C<small>温柔开始</small></span><span>Am</span><span>F</span><span>G</span></div><svg className="score-lines" viewBox="0 0 400 130"><g stroke="#b7bdd4" strokeWidth="1">{[20, 38, 56, 74, 92, 110].map(y => <line key={y} x1="0" y1={y} x2="400" y2={y} />)}{[0, 100, 200, 300, 399].map(x => <line key={x} x1={x} y1="20" x2={x} y2="110" />)}</g><g fill="#535fc5">{[[25, 56], [60, 74], [125, 38], [160, 56], [225, 74], [260, 92], [325, 56], [360, 38]].map(([x, y], i) => <g key={i}><ellipse cx={x} cy={y} rx="7" ry="4.5" transform={`rotate(-18 ${x} ${y})`} /><path d={`M${x + 6} ${y}v-31`} stroke="#535fc5" strokeWidth="1.5" /></g>)}</g></svg><div className="score-foot"><span>♩ = 84</span><span>慢一点，也很好。</span><span>4 / 4</span></div></div><div className="floating-pick"><Guitar size={28} strokeWidth={1.35} /></div><span className="hero-spark one">✦</span><span className="hero-spark two">✧</span><div className="mini-chord"><ChordDiagram chord="C" /><span>今天的第一个和弦</span></div></div></section>
        <section className="start-section"><div className="start-tabs" role="tablist" aria-label="开始方式"><button role="tab" aria-selected="true"><Search size={17} />找一首歌</button><button role="tab" aria-selected="false" onClick={() => { setModal('upload'); setError(''); }}><AudioLines size={17} />从音频开始<span className="beta">实验功能</span></button><button role="tab" aria-selected="false" onClick={() => { setModal('compose'); setError(''); }}><Pencil size={16} />自己写和弦</button></div><form className="search-form" onSubmit={e => { e.preventDefault(); setSearched(query.trim()); }}><Search size={21} /><label className="visually-hidden" htmlFor="song-search">搜索歌名或歌手</label><input id="song-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="输入歌名或歌手，比如：晴天 周杰伦" autoComplete="off" />{query && <button className="icon-button clear-search" type="button" aria-label="清除搜索" onClick={() => { setQuery(''); setSearched(''); }}><X size={16} /></button>}<button className="button primary" type="submit">找曲谱 <ArrowRight size={17} /></button></form><div className="search-hints"><span>试着找找</span>{['晴天 周杰伦', '小星星', '欢乐颂'].map(text => <button className="text-button" key={text} onClick={() => { setQuery(text); setSearched(text); }}>{text}</button>)}<span className="search-privacy"><ShieldCheck size={12} />导入文件仅保存在本机</span></div></section>
        {renderExternalSearch()}
        <section className="recommended"><div className="section-heading"><div><h2>{searched ? '本机练习曲匹配' : '今天，从哪一首开始？'}<span className="heading-accent">♪</span></h2><p>{searched ? '内置曲库仅含下列原创或经典旋律练习编配。' : '几首轻松的练习编配，给手指一点熟悉的时间。'}</p></div><div className="filter-group" aria-label="练习曲筛选">{['全部', '入门友好', '原创练习'].map(name => <button className={filter === name ? 'selected' : ''} key={name} onClick={() => setFilter(name)}>{name}</button>)}</div></div><div className="track-grid">{foundTracks.map((track, index) => <TrackCard key={track.id} track={track} index={index} saved={saved(track.id)} onOpen={() => { void openTrack(track, library.find(item => item.id === track.id)); }} onSave={() => { void toggleSaved(track); }} />)}</div>{!foundTracks.length && <div className="empty-inline"><FileMusic size={25} /><div><strong>内置练习曲中暂时没有这首歌</strong><p>可以使用上方的站外搜索，或导入音频生成自己的和弦草稿。</p></div><button className="button secondary" onClick={() => setModal('upload')}>导入音频</button></div>}</section>
        <section className="local-banner"><div className="banner-illustration"><AudioLines size={28} /></div><div><h3>你收藏的那段旋律，也可以成为练习。</h3><p>选择 MP3 或 WAV，在本机分析和弦，再边听边修正。</p></div><button className="button secondary" onClick={() => { setModal('upload'); setError(''); }}><Upload size={16} />导入我的音频</button></section><footer className="page-footer"><span>弦记 · 每一次拨弦，都是一点进步。</span><a className="text-button" href={USER_GUIDE_URL} target="_blank" rel="noopener noreferrer">完整图文使用指南 <ExternalLink size={12} /></a></footer></div>}

      {view === 'library' && <div className="page"><div className="page-title"><div><span className="eyebrow">YOUR LITTLE SONGBOOK</span><h1>我的曲谱<span className="title-count">{library.length}</span></h1><p>存下想弹的歌，也存下每一次进步。</p></div><div className="row-actions"><button className="button secondary" onClick={() => importRef.current?.click()}><FolderOpen size={16} />导入和弦谱</button><button className="button primary" onClick={() => imageRef.current?.click()}><FileImage size={16} />导入图片谱</button></div></div><div className="info-strip"><ShieldCheck size={17} /><span>曲谱和音频保存在当前浏览器。更换设备或清理浏览器前，请导出备份。</span></div>{library.length ? <div className="track-grid library-grid">{library.map((record, i) => <div className="library-card-wrap" key={record.id}><TrackCard track={record.track} index={i} saved onOpen={() => { void openTrack(record.track, record); }} onSave={() => { void toggleSaved(record.track); }} /><button className="library-delete text-button" onClick={async () => { try { await removePractice(record.id); await refreshLibrary(); notify('已从本机移除'); } catch (e) { notify((e as Error).message); } }}><Trash2 size={13} />移除</button></div>)}</div> : <div className="empty-state"><span className="empty-icon"><Bookmark size={35} strokeWidth={1.3} /></span><h2>你的第一首练习，还没写进来。</h2><p>收藏一首练习曲，导入自己的谱，<br />下次想弹的时候，就在这里找到它。</p><button className="button primary" onClick={() => navigate('discover')}>去发现练习曲 <ArrowRight size={16} /></button></div>}</div>}

      {view === 'chords' && <div className="page dictionary-page"><div className="page-title"><div><span className="eyebrow">ONE CHORD AT A TIME</span><h1>和弦字典</h1><p>认识一个和弦，再让手指记住它。</p></div><span className="standard-tuning"><Guitar size={17} />标准调弦 E A D G B e</span></div><div className="dictionary-layout"><section className="dictionary-list"><div className="section-heading"><h2>常用吉他和弦</h2><span className="subtle-label">{DICTIONARY.length} 个指法</span></div><div className="dictionary-grid">{DICTIONARY.map(chord => <button className={`dictionary-tile ${dictionaryChord === chord ? 'selected' : ''}`} key={chord} onClick={() => setDictionaryChord(chord)} aria-pressed={dictionaryChord === chord}><ChordDiagram chord={chord} /></button>)}</div></section><aside className="chord-detail"><span className="eyebrow">FINGERING NOTES</span><ChordDiagram chord={dictionaryChord} large /><div className="chord-legend"><span>○ 空弦</span><span>× 不弹</span><span>● 按弦</span></div><p>从左到右是六弦到一弦，<br />从上到下是琴枕到琴身。</p><div className="detail-tip"><Sparkles size={17} /><span>指尖尽量靠近品丝，慢慢拨响每一根弦，听听有没有闷音。</span></div><button className="button primary full-width" onClick={() => { setComposeName(`${dictionaryChord} 和弦练习`); setComposeText(`${dictionaryChord} ${dictionaryChord} ${dictionaryChord} ${dictionaryChord}`); setError(''); setModal('compose'); }}>用这个和弦练习 <ArrowRight size={15} /></button></aside></div></div>}

      {view === 'practice' && activeTrack && <div className="page practice-page"><button className="text-button back-button" onClick={() => navigate('discover')}><ArrowLeft size={15} />发现与练习</button><div className="practice-title"><div><div className="practice-title-meta"><span className="level easy">{activeTrack.tags[0] ?? '练习编配'}</span><span>{activeTrack.sourceKind === 'original' ? '弦记原创 · 可自由练习' : activeTrack.sourceKind === 'public-domain' ? '经典旋律 · 自行编配' : '用户本机文件'}</span></div><h1>{activeTrack.title}</h1><p>{activeTrack.artist}</p></div><div className="row-actions"><button className="button secondary" onClick={() => setModal('export')}><ArrowDownToLine size={16} />导出</button><button className="button primary" onClick={() => { void saveActive(); }}><Save size={16} />保存曲谱</button></div></div>
        {!imageUrl && <section className="audition-bar" aria-label="和弦试听"><span className="audition-icon"><Headphones size={23} /></span><div><strong>先听一遍，看看和弦对不对</strong><p>{loadingTrack ? '正在准备吉他伴奏…' : synthesisOutdated ? '和弦或调性已修改，点击试听听最新效果。' : '木吉他音色，分解拨弦与轻扫弦，不含人声。'}</p></div><div className="audition-actions"><button className="button primary" disabled={loadingTrack} onClick={() => { void auditionChords(); }}>{loadingTrack ? <LoaderCircle size={17} className="spin" /> : playing && audioKind === 'synthesized' ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}{loadingTrack ? '准备试听…' : playing && audioKind === 'synthesized' ? '暂停试听' : '试听和弦'}</button>{originalAudioBlob && <button className="button secondary" disabled={loadingTrack} onClick={auditionOriginal}>{playing && audioKind === 'original' ? <Pause size={15} /> : <Headphones size={15} />}{playing && audioKind === 'original' ? '暂停原音频' : '听原音频'}</button>}</div></section>}
        {error && <div className="error-banner" role="alert">{error}<button className="icon-button" aria-label="关闭提示" onClick={() => setError('')}><X size={16} /></button></div>}
        {imageUrl ? <section className="image-workspace"><div className="section-heading"><span><FileImage size={17} />图片谱 · 缩放查看</span><div className="row-actions"><button className="icon-button" aria-label="缩小图片谱" onClick={() => setImageZoom(Math.max(30, imageZoom - 10))}><Minus size={17} /></button><span>{imageZoom}%</span><button className="icon-button" aria-label="放大图片谱" onClick={() => setImageZoom(Math.min(250, imageZoom + 10))}><Plus size={17} /></button></div></div><div className="image-scroll"><img src={imageUrl} alt={`${activeTrack.title} 图片谱`} style={{ width: `${imageZoom}%`, maxWidth: 'none' }} /></div><p className="muted">图片谱支持查看。需要移调、播放和编辑时，请导入结构化和弦谱。</p></section> : <>
        {analysisWarnings.length > 0 && <div className="analysis-notice"><AudioLines size={18} /><div><strong>实验性音频识别草稿</strong><p>{analysisWarnings.join(' ')}</p></div></div>}
        <div className="practice-layout"><div className="score-column"><div className="score-toolbar"><div className="score-facts"><span><Music2 size={15} />{activeTrack.key} 调</span><span>♩ {activeTrack.bpm || '待确认'}</span><span>{activeTrack.timeSignature}/4</span></div><div className="score-edit-actions"><button className="text-button" disabled={!history.length} onClick={() => { const previous = history[history.length - 1]; if (previous) { setActiveTrack(previous); setHistory(history.slice(0, -1)); } }}><RotateCcw size={14} />撤销</button><button className="text-button" onClick={() => { if (originalTrack) { updateTrack(structuredClone(originalTrack)); notify('已恢复初始和弦'); } }}>恢复原谱</button></div></div><section className="chord-sheet" aria-label="和弦时间谱"><div className="sheet-heading"><span>CHORD SHEET</span><span>点击和弦跳转 · 铅笔修改</span></div><div className="chord-grid">{activeTrack.segments.map((segment, i) => <div className={`chord-cell ${activeIndex === i ? 'current' : ''} ${segment.chord === 'N.C.' ? 'uncertain' : ''} ${loop && segment.start >= loop.start && segment.start < loop.end ? 'in-loop' : ''}`} key={segment.id}><button className="chord-seek" aria-label={`跳转到第${i + 1}段 ${displayChord(segment.chord)}`} onClick={() => seek(segment.start)}><span className="cell-number">{String(i + 1).padStart(2, '0')}</span><strong>{displayChord(segment.chord)}</strong><span className="cell-rhythm">{[0, 1, 2, 3].map(beat => <i key={beat} className={activeIndex === i && currentTime >= segment.start + (segment.end - segment.start) * beat / 4 ? 'beat-passed' : ''} />)}</span><small>{formatTime(segment.start)}</small></button><button className="cell-edit" aria-label={`修改第${i + 1}段和弦`} onClick={() => { setEditing(i); setEditChord(segment.chord); setEditStart(segment.start.toFixed(2)); setError(''); }}><Pencil size={12} /></button></div>)}</div>{!activeTrack.segments.length && <div className="empty-inline">没有可识别的和弦，请换一段音频重试。</div>}<div className="sheet-foot"><span>↓　↓ ↑　↑ ↓ ↑</span><span>右手节奏参考 · 按自己的速度练习</span></div></section><section className="track-chord-list"><div className="section-heading"><h3>这首练习用到的和弦</h3><span>{visibleChords.length} 个</span></div><div className="mini-diagrams">{visibleChords.slice(0, 16).map(chord => <ChordDiagram key={chord} chord={chord} />)}</div></section></div>
        <aside className="practice-inspector"><div className="current-chord"><span className="eyebrow">现在弹这个</span><ChordDiagram chord={activeSegment ? displayChord(activeSegment.chord) : 'N.C.'} large /><div className="next-chord">下一个 <strong>{activeTrack.segments[activeIndex + 1] ? displayChord(activeTrack.segments[activeIndex + 1].chord) : '结束'}</strong><ArrowRight size={15} /></div></div><div className="practice-settings"><h3><SlidersHorizontal size={16} />练习设置</h3><button className={`metronome-button ${metronome ? 'enabled' : ''}`} aria-pressed={metronome} disabled={!activeTrack.bpm} onClick={async () => { if (metronome) { setMetronome(false); return; } try { metronomeContext.current ??= new AudioContext(); await metronomeContext.current.resume(); lastBeat.current = -1; setMetronome(true); notify('节拍器随音频播放，按参考速度从 0 秒计拍'); } catch { notify('浏览器暂未允许节拍器音频，请重试。'); } }}><Timer size={14} />节拍器<span>{metronome ? '已开启' : '已关闭'}</span></button><div className="setting-row"><label htmlFor="capo-select">变调夹</label><select id="capo-select" value={capo} onChange={e => setCapo(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i === 0 ? '不用变调夹' : `第 ${i} 品`}</option>)}</select></div><div className="setting-row"><span>谱面移调</span><div className="stepper"><button aria-label="降半音" onClick={() => setTranspose(Math.max(-12, transpose - 1))}><Minus size={13} /></button><span>{transpose > 0 ? '+' : ''}{transpose}</span><button aria-label="升半音" onClick={() => setTranspose(Math.min(12, transpose + 1))}><Plus size={13} /></button></div></div>{transpose !== 0 && <p className="setting-warning">谱面已移调，原音频音高保持不变。</p>}<button className="easy-button" onClick={() => { const recommendation = getEasyCapo(activeTrack.segments.map(s => transposeChord(s.chord, transpose))); setCapo(recommendation.capo); notify(recommendation.capo ? `建议变调夹 ${recommendation.capo} 品，实际发声调性保持不变` : '当前指法已比较容易，可以不用变调夹'); }}><Sparkles size={15} />试试更容易的指法</button><p className="setting-hint">变调夹改变手上指法，保持实际发声调性。复杂和弦可能仍需横按。</p></div></aside></div>
        <div className="player"><audio ref={audioRef} src={audioUrl || undefined} preload="metadata" onLoadedMetadata={handleAudioReady} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { if (audioUrl) setError('浏览器无法播放这份音频，请尝试 WAV 或 MP3 文件。'); }} /><div className="player-main"><div className="player-track-icon"><AudioLines size={22} /></div><div className="player-track-title"><strong>{activeTrack.title}</strong><small>{audioKind === 'original' ? '本机原音频' : synthesisOutdated ? '和弦已更新 · 播放时重新合成' : '当前和弦 · 合成吉他伴奏'}</small></div><div className="transport"><button className="icon-button skip-button" aria-label="上一个和弦" disabled={loadingTrack || !audioUrl} onClick={() => seek(activeTrack.segments[Math.max(0, activeIndex - 1)]?.start ?? 0)}><ChevronLeft size={21} /></button><button className="play-button" aria-label={playing ? '暂停' : '播放'} disabled={loadingTrack || !audioUrl} onClick={() => { void togglePlayback(); }}>{loadingTrack ? <LoaderCircle size={22} className="spin" /> : playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button><button className="icon-button skip-button" aria-label="下一个和弦" disabled={loadingTrack || !audioUrl} onClick={() => seek(activeTrack.segments[Math.min(activeTrack.segments.length - 1, activeIndex + 1)]?.start ?? 0)}><ChevronRight size={21} /></button></div><div className="player-timeline"><span>{formatTime(currentTime)}</span><input aria-label="播放进度" type="range" min="0" max={duration || 1} step="0.05" value={Math.min(currentTime, duration || 1)} onChange={e => seek(Number(e.target.value))} /><span>{formatTime(duration)}</span></div><div className="player-options"><label className="speed-select"><select aria-label="播放速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.5, .65, .75, .85, 1, 1.25].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select><ChevronDown size={12} /></label><button className={`icon-button ${loop ? 'active-control' : ''}`} aria-label={loop ? '取消循环' : loopStart !== null ? '设置循环终点 B' : '设置循环起点 A'} title={loop ? '取消循环' : loopStart !== null ? '设置终点 B' : '设置起点 A'} onClick={() => { if (loop) { setLoop(null); setLoopStart(null); notify('已取消循环'); } else if (loopStart === null) { setLoopStart(currentTime); notify(`起点 A 已设为 ${formatTime(currentTime)}，播放到终点再点击一次`); } else if (currentTime > loopStart + .3) { setLoop({ start: loopStart, end: currentTime }); seek(loopStart); setLoopStart(null); notify('A–B 分段循环已开启'); } else notify('请在起点之后设置终点 B'); }}><Repeat2 size={18} />{loopStart !== null && <i className="loop-marker">A</i>}</button><label className="volume-control"><Volume2 size={17} /><input type="range" aria-label="音量" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(Number(e.target.value))} /></label></div></div>{(loop || loopStart !== null) && <div className="loop-status">{loop ? `循环 ${formatTime(loop.start)} — ${formatTime(loop.end)}` : `已设置 A 点 ${formatTime(loopStart ?? 0)}，再次点击循环按钮设置 B 点`}</div>}</div><div className="practice-footer"><span><ShieldCheck size={13} />音频与修改仅在本机</span><span>空格 播放 / 暂停</span></div>
        </>}
      </div>}
    </main></div>

    {modal === 'upload' && <Modal title="从一段音频开始" onClose={() => { if (progress) { cancelAnalysis.current?.abort(); } setModal(null); setError(''); }}><div className="modal-description">把想练习的音频放进来，生成一份可以试听和修改的和弦草稿。</div>{progress ? <div className="analysis-progress"><div className="analysis-orb"><AudioLines size={34} /></div><h3>{progress.stage}</h3><div className="progress-track"><span style={{ width: `${progress.progress * (progress.progress <= 1 ? 100 : 1)}%` }} /></div><p>正在你的设备上处理，音频不会上传。</p><button className="button secondary" onClick={() => { cancelAnalysis.current?.abort(); }}>取消分析</button></div> : <button className="upload-dropzone" onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void analyze(file); }}><span className="upload-circle"><Upload size={26} /></span><strong>点击选择，或把音频拖到这里</strong><span>MP3 / WAV · 最大 50 MB · 最长 10 分钟</span><span className="button primary">选择音频 <ArrowRight size={16} /></span></button>}{error && <div className="error-banner" role="alert">{error}</div>}<div className="upload-footnote"><ShieldCheck size={18} /><p>文件只在浏览器本机读取。基础频谱分析更适合清晰的弹唱录音；复杂编曲、转位和七和弦需要人工核对。</p></div><div className="modal-divider" /><div className="alternate-import"><span>已经有谱了？</span><button className="text-button" onClick={() => importRef.current?.click()}><FileMusic size={15} />导入和弦谱</button><button className="text-button" onClick={() => imageRef.current?.click()}><FileImage size={15} />导入图片谱</button></div></Modal>}

    {modal === 'compose' && <Modal title="写下你的和弦" onClose={() => { setModal(null); setError(''); }}><p className="modal-description">输入和弦，先听听木吉他伴奏，再生成练习谱。每个和弦默认一小节。</p><label className="field-label" htmlFor="compose-title">练习名称</label><input className="form-input" id="compose-title" value={composeName} onChange={e => setComposeName(e.target.value)} maxLength={120} /><label className="field-label" htmlFor="compose-chords">和弦进行</label><textarea className="form-input chord-textarea" id="compose-chords" value={composeText} onChange={e => setComposeText(e.target.value)} spellCheck={false} /><p className="muted small">用空格或换行分隔，例如 C Am F G。也支持 [C] 这样的 ChordPro 标记。</p><div className="compose-tempo"><label htmlFor="compose-tempo">试听速度</label><select id="compose-tempo" value={composeBpm} onChange={event => setComposeBpm(Number(event.target.value))}>{[60, 72, 84, 96, 108, 120].map(bpm => <option key={bpm} value={bpm}>{bpm} BPM</option>)}</select><span>每个和弦 4 拍</span></div><ComposerPreview title={composeName} chordsText={composeText} bpm={composeBpm} />{error && <div className="error-banner" role="alert">{error}</div>}<button className="button primary full-width" onClick={createTrack}><Music2 size={16} />生成练习谱</button></Modal>}

    {modal === 'export' && activeTrack && <Modal title="把练习带走" onClose={() => setModal(null)}><p className="modal-description">导出文件到自己的设备，方便备份或继续编配。</p>{!imageUrl && <><button className="export-option" onClick={() => { downloadFile(toJson(activeTrack), `${activeTrack.title}.json`, 'application/json'); notify('已导出原始调性的和弦数据'); }}><FileMusic size={24} /><span><strong>和弦数据 JSON</strong><small>保留实际发声和弦与时间位置，可重新导入</small></span><ArrowDownToLine size={17} /></button><button className="export-option" onClick={() => { downloadFile(toChordPro(activeTrack, transpose, capo), `${activeTrack.title}.cho`); notify('已导出当前指法的 ChordPro 谱'); }}><FileMusic size={24} /><span><strong>ChordPro 和弦谱</strong><small>导出当前指法，含变调夹与移调说明</small></span><ArrowDownToLine size={17} /></button>{audioBlob && <button className="export-option" disabled={synthesisOutdated} onClick={() => downloadFile(audioBlob, audioBlob instanceof File ? audioBlob.name : `${activeTrack.title}.${audioBlob.type.includes('mpeg') ? 'mp3' : 'wav'}`)}><Headphones size={24} /><span><strong>练习音频</strong><small>备份当前本机音频文件</small></span><ArrowDownToLine size={17} /></button>}<button className="export-option" onClick={() => { setModal(null); setTimeout(() => window.print(), 150); }}><FileImage size={24} /><span><strong>打印 / 保存为 PDF</strong><small>通过浏览器打印谱面与指法</small></span><ExternalLink size={17} /></button></>}{imageUrl && imageBlob && <button className="export-option" onClick={() => downloadFile(imageBlob, `${activeTrack.title}.${imageBlob.type.split('/')[1] || 'png'}`)}><FileImage size={24} /><span><strong>导出原始图片谱</strong><small>保存导入的本机图片</small></span><ArrowDownToLine size={17} /></button>}</Modal>}

    {modal === 'help' && <Modal title="弦记使用指南" onClose={() => setModal(null)} wide><section className="help-start" aria-label="一分钟上手"><span className="eyebrow">第一次使用，从听到声音开始</span><h3>先写四个和弦，听一遍。</h3><ol><li>回首页点“自己写和弦”，输入 <code>C Am F G</code>。</li><li>点“试听和弦”，先听吉他伴奏；再点“生成练习谱”进入工作台。</li><li>想下次继续，点“保存曲谱”，以后从“我的曲谱”打开。</li></ol><a className="button primary" href={USER_GUIDE_URL} target="_blank" rel="noopener noreferrer">打开完整图文使用指南 <ExternalLink size={15} /></a><p>逐步说明所有功能、每个按钮和常见问题。指南在 GitHub 打开。</p></section><div className="help-grid"><div><span className="help-number"><Search size={19} /></span><h3>先找到想弹的歌</h3><p>歌名和歌手可以定位站外搜索。外部曲谱需在原站确认版本；内置练习曲为原创或经典旋律的自行编配。</p></div><div><span className="help-number"><AudioLines size={19} /></span><h3>音频变成和弦草稿</h3><p>导入 MP3 或 WAV，在本机做基础频谱分析。复杂混音、七和弦和转位需要人工修正，当前没有真实流行歌准确率保证。</p></div><div><span className="help-number"><Guitar size={19} /></span><h3>改和弦、改调后，再听一遍</h3><p>铅笔改和弦，“谱面移调”改调性，再点“试听和弦”生成新伴奏。变调夹只换指法；上传的原录音保持原音高。</p></div><div><span className="help-number"><ShieldCheck size={19} /></span><h3>把成果留在自己手里</h3><p>“保存曲谱”保存在本机浏览器。更换设备或清理数据前，导出 JSON 和音频备份；网站不收集你的音频。</p></div></div><div className="help-footer"><Logo /><span>让喜欢的歌，落在你的指尖。<br /><small>Stringnote · 浏览器本机练习工具 · <a href={`${import.meta.env.BASE_URL}audio/LICENSE.md`} target="_blank" rel="noopener noreferrer">音色来源与许可</a></small></span></div></Modal>}

    {editing !== null && activeTrack && <Modal title={`修改第 ${editing + 1} 段和弦`} onClose={() => { setEditing(null); setError(''); }}><label className="field-label" htmlFor="edit-chord">实际发声和弦</label><input id="edit-chord" className="form-input" value={editChord} onChange={e => setEditChord(e.target.value)} autoComplete="off" maxLength={24} /><p className="muted small">填写原调和弦；变调夹与谱面移调会自动计算显示指法。</p><label className="field-label" htmlFor="edit-start">起始时间（秒）</label><input id="edit-start" className="form-input" type="number" min="0" step="0.01" value={editStart} disabled={editing === 0} onChange={e => setEditStart(e.target.value)} /><p className="muted small">终点 {activeTrack.segments[editing].end.toFixed(2)} 秒；修改起点时，上一段终点也会一起调整。</p>{error && <div className="error-banner" role="alert">{error}</div>}<div className="edit-modal-actions"><button className="button secondary" onClick={() => { const next = structuredClone(activeTrack); const segment = next.segments[editing]; if (segment.end - segment.start < .2) { setError('此片段太短，无法继续拆分。'); return; } const middle = (segment.start + segment.end) / 2; const second = { ...segment, id: crypto.randomUUID(), start: middle }; segment.end = middle; next.segments.splice(editing + 1, 0, second); updateTrack(next); setEditing(null); notify('已从中间拆成两段'); }}>拆分片段</button>{editing > 0 && <button className="button secondary" onClick={() => { const next = structuredClone(activeTrack); next.segments[editing - 1].end = next.segments[editing].end; next.segments.splice(editing, 1); updateTrack(next); setEditing(null); notify('已与上一段合并'); }}>合并到上一段</button>}<button className="button primary" onClick={applyEdit}><Check size={16} />保存修改</button></div></Modal>}
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span></div>}
  </div>;
}
