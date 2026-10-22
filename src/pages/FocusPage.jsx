import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { messages } from '../i18n.js';
import { useFocusSession } from '../components/FocusSessionContext.jsx';

const PRESETS = [15, 25, 45, 60];

export default function FocusPage({ language, onUnauthorized }) {
  const [stats, setStats] = useState(null);
  const [minutes, setMinutes] = useState(25);
  const [context, setContext] = useState('');
  const { session, seconds, busy, error, setError, startSession, pauseSession, resumeSession, completeSession, discardSession } = useFocusSession();
  const [ambience, setAmbience] = useState('');
  const [ambienceVolume, setAmbienceVolume] = useState(35);
  const ambienceAudio = useRef({ context: null, nodes: [], gain: null, gainScale: 0.5 });
  const t = messages[language];
  const isArabic = language === 'ar';
  const load = useCallback(async () => {
    try { setStats(await api('/focus')); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => {
    ambienceAudio.current.nodes.forEach(node => {
      if (typeof node.stop === 'function') node.stop();
      node.disconnect();
    });
    ambienceAudio.current.nodes = [];
  }, []);

  async function start() { await startSession({ minutes, contextLabel: context }); }
  async function complete() {
    if (await completeSession()) await load();
  }

  function stopAmbience() {
    ambienceAudio.current.nodes.forEach(node => {
      if (typeof node.stop === 'function') node.stop();
      node.disconnect();
    });
    ambienceAudio.current.nodes = [];
    ambienceAudio.current.gain = null;
    setAmbience('');
  }

  async function playAmbience(kind) {
    if (ambience === kind) {
      stopAmbience();
      return;
    }
    if (ambienceAudio.current.nodes.length) stopAmbience();
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) {
      setError(isArabic ? 'تشغيل الأصوات الهادئة غير مدعوم في هذا المتصفح.' : 'Ambient audio is not supported in this browser.');
      return;
    }
    setError('');
    try {
      const context = ambienceAudio.current.context || new AudioContextType();
      ambienceAudio.current.context = context;
      await context.resume();
      const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let filteredNoise = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const whiteNoise = Math.random() * 2 - 1;
        filteredNoise = kind === 'waves'
          ? filteredNoise * 0.996 + whiteNoise * 0.035
          : kind === 'breeze'
            ? filteredNoise * 0.94 + whiteNoise * 0.12
            : whiteNoise;
        samples[index] = filteredNoise;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = kind === 'rain' ? 'highpass' : 'lowpass';
      filter.frequency.value = kind === 'waves' ? 340 : kind === 'breeze' ? 620 : 900;
      const rainSoftener = kind === 'rain' ? context.createBiquadFilter() : null;
      if (rainSoftener) {
        rainSoftener.type = 'lowpass';
        rainSoftener.frequency.value = 4200;
      }
      const gain = context.createGain();
      const gainScale = kind === 'rain' ? 0.19 : 0.5;
      gain.gain.value = ambienceVolume / 100 * gainScale;
      source.connect(filter);
      filter.connect(rainSoftener || gain);
      if (rainSoftener) rainSoftener.connect(gain);
      gain.connect(context.destination);
      const nodes = [source];
      if (kind === 'waves') {
        const swell = context.createOscillator();
        const swellDepth = context.createGain();
        swell.frequency.value = 0.09;
        swellDepth.gain.value = 0.13;
        swell.connect(swellDepth);
        swellDepth.connect(gain.gain);
        swell.start();
        nodes.push(swell);
      }
      source.start();
      nodes.push(filter, ...(rainSoftener ? [rainSoftener] : []), gain);
      ambienceAudio.current.nodes = nodes;
      ambienceAudio.current.gain = gain;
      ambienceAudio.current.gainScale = gainScale;
      setAmbience(kind);
    } catch (failure) {
      setError(failure.message || (isArabic ? 'تعذّر تشغيل الصوت.' : 'Could not start ambient audio.'));
    }
  }

  function changeAmbienceVolume(value) {
    const nextVolume = Number(value);
    setAmbienceVolume(nextVolume);
    if (ambienceAudio.current.gain) {
      ambienceAudio.current.gain.gain.setTargetAtTime(nextVolume / 100 * ambienceAudio.current.gainScale, ambienceAudio.current.context.currentTime, 0.08);
    }
  }

  const paused = Boolean(session?.paused);
  const durationSeconds = Number(session?.minutes || minutes) * 60;
  const remaining = Math.max(0, durationSeconds - seconds);
  const progress = session && durationSeconds ? Math.min(100, seconds / durationSeconds * 100) : 0;
  const timeLabel = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const sessions = stats?.sessions || [];
  const formatSessionDate = value => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  return <section className="page-card focus-page">
    <header className="page-heading">
      <div><span className="focus-eyebrow">{isArabic ? 'وقت لنفسك' : 'A little time for yourself'}</span><h1>{t.focus}</h1>
        <p>{isArabic ? 'جلسات هادئة تساعدك على إنجاز ما يهم.' : 'Quiet, intentional sessions for the work that matters.'}</p></div>
      <span className="focus-xp-badge">✦ {stats?.total_xp || 0} XP</span>
    </header>
    {error && <p className="notice error" role="alert">{error}</p>}

    <section className={`focus-studio ${session ? 'focus-studio-active' : ''}`}>
      <div className="focus-studio-copy">
        <span className="focus-session-label">{session ? (paused ? (isArabic ? 'الجلسة متوقفة مؤقتاً' : 'Session paused') : (isArabic ? 'أنت في المنطقة' : 'You are in focus')) : (isArabic ? 'أنشئ مساحة للتركيز' : 'Make room to focus')}</span>
        <h2>{session ? (session.contextLabel || (isArabic ? 'جلسة تركيز' : 'Focus session')) : (isArabic ? 'ما الذي تريد إنجازه؟' : 'What would you like to work on?')}</h2>
        <p>{session
          ? (paused ? (isArabic ? 'استأنف عندما تكون مستعداً.' : 'Resume when you are ready.') : (isArabic ? 'أبعد المشتتات وخذها خطوة بخطوة.' : 'Set distractions aside and take it one step at a time.'))
          : (isArabic ? 'اختر مدة مناسبة، واكتب نيتك لهذه الجلسة.' : 'Choose a comfortable duration and set an intention for this session.')}</p>
      </div>
      {session ? <div className="focus-timer" style={{ '--focus-progress': `${progress}%` }} role="timer" aria-label={`${timeLabel} ${isArabic ? 'متبقية' : 'remaining'}`}>
        <div className="focus-timer-face"><strong>{timeLabel}</strong><span>{paused ? (isArabic ? 'متوقف' : 'Paused') : (isArabic ? 'متبقي' : 'remaining')}</span></div>
      </div> : <div className="focus-setup">
        <label className="focus-context-label">{isArabic ? 'نية الجلسة (اختياري)' : 'Session intention (optional)'}
          <input dir="auto" maxLength="160" value={context} onChange={event => setContext(event.target.value)} placeholder={isArabic ? 'مثال: قراءة فصل من الكتاب' : 'e.g. Read one chapter'} />
        </label>
        <div className="focus-duration-picker">
          <span>{isArabic ? 'المدة' : 'Duration'}</span>
          <div className="focus-presets" role="group" aria-label={isArabic ? 'مدة الجلسة بالدقائق' : 'Session duration in minutes'}>
            {PRESETS.map(value => <button key={value} type="button" className={`focus-preset ${Number(minutes) === value ? 'active' : ''}`} onClick={() => setMinutes(value)}>{value}<small>{isArabic ? 'د' : 'min'}</small></button>)}
          </div>
          <label className="focus-custom-duration">{isArabic ? 'مخصص' : 'Custom'}
            <input type="number" min="1" max="180" value={minutes} onChange={event => setMinutes(Math.max(1, Math.min(180, Number(event.target.value) || 1)))} />
          </label>
        </div>
        <button className="button button-primary focus-start-button" type="button" disabled={busy} onClick={start}>▶ {isArabic ? 'ابدأ جلسة التركيز' : 'Start focus session'}</button>
      </div>}
      {session && <div className="focus-session-actions">
        {remaining > 0
          ? <button className="button button-primary focus-start-button" type="button" disabled={busy} onClick={paused ? resumeSession : pauseSession}>{paused ? (isArabic ? 'استئناف الجلسة' : 'Resume session') : (isArabic ? 'إيقاف مؤقت' : 'Pause session')}</button>
          : <button className="button button-primary focus-start-button" type="button" disabled={busy} onClick={complete}>{isArabic ? 'إنهاء الجلسة وكسب XP' : 'Complete session & earn XP'}</button>}
        <button className="button button-quiet" type="button" disabled={busy} onClick={discardSession}>{isArabic ? 'إلغاء الجلسة' : 'Discard session'}</button>
      </div>}
    </section>
    <section className="focus-ambience" aria-label={isArabic ? 'أصوات هادئة' : 'Calming sounds'}>
      <div className="focus-ambience-heading"><span className="focus-ambience-icon" aria-hidden="true">♫</span><div>
        <h2>{isArabic ? 'أصوات هادئة' : 'Calming sounds'}</h2>
        <p>{isArabic ? 'أصوات تُولّد محلياً لترافق تركيزك.' : 'Locally generated soundscapes to accompany your focus.'}</p>
      </div></div>
      <div className="focus-sound-options">
        {[
          ['waves', '≈', isArabic ? 'أمواج البحر' : 'Ocean waves'],
          ['rain', '☂', isArabic ? 'مطر هادئ' : 'Soft rain'],
          ['breeze', '〰', isArabic ? 'نسيم' : 'Gentle breeze'],
        ].map(([kind, icon, label]) => <button className={`focus-sound-option ${ambience === kind ? 'active' : ''}`} type="button" key={kind} aria-pressed={ambience === kind} onClick={() => playAmbience(kind)}>
          <span aria-hidden="true">{icon}</span><strong>{label}</strong><small>{ambience === kind ? (isArabic ? 'يعمل الآن · اضغط للإيقاف' : 'Playing · click to stop') : (isArabic ? 'تشغيل' : 'Play')}</small>
        </button>)}
      </div>
      <label className="focus-volume-control"><span>{isArabic ? 'مستوى الصوت' : 'Volume'}</span><input type="range" min="0" max="100" value={ambienceVolume} onChange={event => changeAmbienceVolume(event.target.value)} aria-label={isArabic ? 'مستوى صوت الخلفية' : 'Ambient volume'} /><span>{ambienceVolume}%</span></label>
    </section>

    <section className="focus-stats" aria-label={isArabic ? 'ملخص التركيز' : 'Focus summary'}>
      <article><span>{isArabic ? 'إجمالي نقاط XP' : 'Total XP'}</span><strong>{stats?.total_xp || 0}</strong></article>
      <article><span>{isArabic ? 'نقاط هذا الأسبوع' : 'This week'}</span><strong>{stats?.week_xp || 0}</strong></article>
      <article><span>{isArabic ? 'جلسات مكتملة' : 'Sessions completed'}</span><strong>{stats?.completed_sessions || 0}</strong></article>
      <article><span>{isArabic ? 'دقائق تركيز' : 'Focus minutes'}</span><strong>{stats?.focus_minutes || 0}</strong></article>
    </section>

    <section className="focus-history">
      <header className="finance-section-heading"><div><h2>{isArabic ? 'سجل جلساتك' : 'Your focus history'}</h2><p>{isArabic ? 'كل جلسة مكتملة هي خطوة للأمام.' : 'Every completed session is progress.'}</p></div></header>
      {sessions.length ? <div className="focus-history-list">{sessions.map(row => <article className="focus-history-row" key={row.id}>
        <span className="focus-history-icon" aria-hidden="true">✓</span>
        <div className="focus-history-copy"><strong>{row.todo_title || row.context_label || (isArabic ? 'جلسة تركيز' : 'Focus session')}</strong><span>{formatSessionDate(row.completed_at)}</span></div>
        <span className="focus-history-duration">{row.focus_minutes} {isArabic ? 'دقيقة' : 'min'}</span>
        <strong className="focus-history-xp">+{row.xp_earned} XP</strong>
      </article>)}</div> : <p className="focus-history-empty">{isArabic ? 'ستظهر جلساتك المكتملة هنا. ابدأ جلستك الأولى عندما تكون مستعداً.' : 'Completed sessions will show up here. Start your first one whenever you are ready.'}</p>}
    </section>
  </section>;
}
