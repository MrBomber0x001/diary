import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { messages } from '../i18n.js';
import { useLocation } from '../navigation.jsx';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';
import CollectionPage from './CollectionPage.jsx';
import { collections } from './collections.js';
import { parseQuestionImport } from '../question-import.mjs';

const topicFields = [{ key: 'title', label: 'موضوع التدريب', required: true }];
const cardFields = [
  { key: 'question', label: 'السؤال', type: 'textarea', wide: true, required: true },
  { key: 'answer', label: 'الإجابة', type: 'textarea', wide: true, required: true },
  { key: 'answer_notes', label: 'ملاحظات الإجابة', type: 'textarea', wide: true },
  { key: 'tags', label: 'الوسوم (افصل بينها بفواصل)', wide: true },
  { key: 'difficulty', label: 'الصعوبة', type: 'select', options: [
    { value: 'beginner', label: 'مبتدئ' },
    { value: 'intermediate', label: 'متوسط' },
    { value: 'advanced', label: 'متقدم' },
  ] },
];
const roundFields = [
  { key: 'round_name', label: 'اسم الجولة' },
  { key: 'occurred_on', label: 'تاريخ المقابلة', type: 'date' },
  { key: 'scheduled_start', label: 'موعد البداية', type: 'datetime-local' },
  { key: 'scheduled_end', label: 'موعد النهاية', type: 'datetime-local' },
  { key: 'questions_answers', label: 'الأسئلة والإجابات', type: 'textarea', wide: true },
  { key: 'questions_for_them', label: 'أسئلة لطرحها', type: 'textarea', wide: true },
  { key: 'experience', label: 'الخبرة والدروس', type: 'textarea', wide: true },
  { key: 'follow_up', label: 'المتابعة', type: 'textarea', wide: true },
];

export default function InterviewPage({ language, onUnauthorized }) {
  const location = useLocation();
  const [section, setSection] = useState('applications');
  const [topics, setTopics] = useState([]);
  const [topic, setTopic] = useState(null);
  const [application, setApplication] = useState(null);
  const [editingRound, setEditingRound] = useState(null);
  const [adding, setAdding] = useState(false);
  const [quiz, setQuiz] = useState(null);
  const [cardSearch, setCardSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [practiceFilter, setPracticeFilter] = useState('');
  const [bankPage, setBankPage] = useState(1);
  const [bankMeta, setBankMeta] = useState({ total: 0, page: 1, pageCount: 0 });
  const [practiceMode, setPracticeMode] = useState('random');
  const [questionCount, setQuestionCount] = useState('10');
  const [practiceDifficulty, setPracticeDifficulty] = useState('');
  const [practiceTag, setPracticeTag] = useState('');
  const [timeLimit, setTimeLimit] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [responseRating, setResponseRating] = useState('');
  const [practiceSummary, setPracticeSummary] = useState(null);
  const [practiceHistory, setPracticeHistory] = useState([]);
  const [editingCard, setEditingCard] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFormat, setImportFormat] = useState('csv');
  const [importText, setImportText] = useState('');
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState('');
  const [recordingError, setRecordingError] = useState('');
  const [bankBusy, setBankBusy] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [error, setError] = useState('');
  const t = messages[language];
  const localizedCardFields = cardFields.map(field => ({
    ...field,
    label: language === 'ar' ? field.label : ({
      question: 'Question',
      answer: 'Sample answer',
      answer_notes: 'Answer notes',
      tags: 'Tags (comma-separated)',
      difficulty: 'Difficulty',
    })[field.key] || field.label,
    options: field.key === 'difficulty' && language !== 'ar'
      ? [
        { value: 'beginner', label: 'Beginner' },
        { value: 'intermediate', label: 'Intermediate' },
        { value: 'advanced', label: 'Advanced' },
      ]
      : field.options,
    defaultValue: field.key === 'difficulty' ? 'intermediate' : field.defaultValue,
  }));
  const loadTopics = useCallback(async () => {
    try { setTopics(await api('/interviews/mock')); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { loadTopics(); }, [loadTopics]);
  useEffect(() => {
    const applicationId = new URLSearchParams(location.split('?')[1] || '').get('application');
    if (!applicationId || !/^\d+$/.test(applicationId)) return;
    let active = true;
    api('/interviews').then(rows => {
      if (!active) return;
      const match = rows.find(row => String(row.id) === applicationId);
      if (match) {
        setSection('applications');
        setApplication(match);
      } else setError(language === 'ar' ? 'طلب التوظيف المرتبط غير موجود.' : 'The linked job application was not found.');
    }).catch(failure => {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    });
    return () => { active = false; };
  }, [language, location, onUnauthorized]);

  async function loadPracticeHistory(topicId) {
    try { setPracticeHistory(await api(`/interviews/topics/${topicId}/practice-sessions`)); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }
  async function openTopic(row) {
    try {
      const result = await api(`/interviews/topics/${row.id}/cards?page=1&pageSize=50`);
      setTopic({ ...row, cards: result.cards || [] });
      setBankMeta(result);
      setQuiz(null);
      setBankPage(1);
      setCardSearch('');
      setDifficultyFilter('');
      setTagFilter('');
      setPracticeFilter('');
      setPracticeMode('random');
      setPracticeDifficulty('');
      setPracticeTag('');
      setPracticeSummary(null);
      setImportResult(null);
      setImportOpen(false);
      setImportRows([]);
      setImportText('');
      await loadPracticeHistory(row.id);
    } catch (failure) { setError(failure.message); }
  }
  useEffect(() => {
    if (!topic || quiz) return undefined;
    let active = true;
    const params = new URLSearchParams({ page: String(bankPage), pageSize: '50' });
    if (cardSearch.trim()) params.set('q', cardSearch.trim());
    if (difficultyFilter) params.set('difficulty', difficultyFilter);
    if (tagFilter.trim()) params.set('tag', tagFilter.trim());
    if (practiceFilter) params.set('mode', practiceFilter);
    setBankBusy(true);
    api(`/interviews/topics/${topic.id}/cards?${params.toString()}`).then(result => {
      if (!active) return;
      setTopic(current => current?.id === topic.id ? { ...current, cards: result.cards } : current);
      setBankMeta(result);
    }).catch(failure => {
      if (!active) return;
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }).finally(() => { if (active) setBankBusy(false); });
    return () => { active = false; };
  }, [bankPage, cardSearch, difficultyFilter, onUnauthorized, practiceFilter, quiz, tagFilter, topic?.id]);
  useEffect(() => {
    if (!quiz || quiz.paused) return undefined;
    const timer = window.setInterval(() => {
      setQuiz(current => {
        if (!current || current.paused) return current;
        const remainingSeconds = current.remainingSeconds === null ? null : Math.max(0, current.remainingSeconds - 1);
        return {
          ...current,
          elapsedSeconds: current.elapsedSeconds + 1,
          currentElapsedSeconds: current.currentElapsedSeconds + 1,
          remainingSeconds,
          paused: remainingSeconds === 0,
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [quiz?.id, quiz?.paused]);
  useEffect(() => {
    if (quiz?.paused && recorderRef.current?.state === 'recording') recorderRef.current.pause();
  }, [quiz?.paused]);
  useEffect(() => {
    if (section !== 'cards' && quiz && !quiz.paused) {
      setQuiz(current => current ? { ...current, paused: true } : current);
    }
  }, [section, quiz?.id, quiz?.paused]);
  useEffect(() => () => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);
  useEffect(() => {
    if (!recordedAudio) return undefined;
    return () => URL.revokeObjectURL(recordedAudio);
  }, [recordedAudio]);
  async function addTopic(value) {
    try { const row = await api('/interviews/topics', { method: 'POST', body: value }); setAdding(false); await loadTopics(); await openTopic(row); }
    catch (failure) { setError(failure.message); }
  }
  async function addCard(value) {
    try {
      await api(`/interviews/topics/${topic.id}/cards`, { method: 'POST', body: value });
      setAdding(false);
      setBankPage(1);
      const result = await api(`/interviews/topics/${topic.id}/cards?page=1&pageSize=50`);
      setTopic(current => ({ ...current, cards: result.cards }));
      setBankMeta(result);
      setBankPage(result.page);
      await loadTopics();
    } catch (failure) { setError(failure.message); }
  }
  function prepareQuestionImport() {
    setImportError('');
    try {
      setImportRows(parseQuestionImport(importFormat, importText.trim()));
    } catch (failure) {
      setImportRows([]);
      setImportError(failure.message);
    }
  }
  async function readQuestionImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const format = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
      const content = await file.text();
      setImportFormat(format);
      setImportText(content);
      setImportError('');
      setImportRows([]);
    } catch (failure) {
      setImportError(failure.message);
    } finally {
      event.target.value = '';
    }
  }
  function downloadQuestionTemplate() {
    const template = 'question,answer,answer_notes,tags,difficulty\r\n"How would you design a rate limiter?","Use a token bucket and shared storage.","Discuss burst handling and consistency.","system design,distributed systems",intermediate\r\n';
    const url = URL.createObjectURL(new Blob([template], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'question-import-template.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importQuestions() {
    setImportBusy(true);
    setImportError('');
    let imported = 0;
    let duplicates = 0;
    try {
      const batches = [];
      let batch = [];
      for (const card of importRows) {
        const candidate = [...batch, card];
        const candidateSize = new TextEncoder().encode(JSON.stringify({ cards: candidate })).length;
        if (candidateSize > 24000 && !batch.length) {
          throw new Error(language === 'ar'
            ? 'أحد الأسئلة طويل جداً للاستيراد. قلّل طول الإجابة أو الملاحظات ثم أعد المحاولة.'
            : 'A question is too large to import. Shorten its answer or notes and try again.');
        }
        if (batch.length && candidateSize > 24000) {
          batches.push(batch);
          batch = [card];
        } else batch = candidate;
      }
      if (batch.length) batches.push(batch);
      for (const cards of batches) {
        const result = await api(`/interviews/topics/${topic.id}/cards/import`, {
          method: 'POST',
          body: { cards },
        });
        imported += result.imported;
        duplicates += result.duplicates;
      }
      setCardSearch('');
      setDifficultyFilter('');
      setTagFilter('');
      setPracticeFilter('');
      setBankPage(1);
      const result = await api(`/interviews/topics/${topic.id}/cards?page=1&pageSize=50`);
      setTopic(current => ({ ...current, cards: result.cards }));
      setBankMeta(result);
      setImportOpen(false);
      setImportText('');
      setImportRows([]);
      setImportResult({ imported, duplicates });
      await loadTopics();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else {
        setImportError(imported
          ? (language === 'ar'
          ? `تم استيراد ${imported} سؤالاً قبل التوقف. تعذر استيراد الباقي: ${failure.message}`
          : `Imported ${imported} questions before stopping. The rest could not be imported: ${failure.message}`)
          : failure.message);
        if (imported) {
          try {
            setBankPage(1);
            const partial = await api(`/interviews/topics/${topic.id}/cards?page=1&pageSize=50`);
            setTopic(current => ({ ...current, cards: partial.cards }));
            setBankMeta(partial);
          } catch (refreshFailure) {
            setImportError(current => `${current} ${language === 'ar' ? 'تعذر تحديث قائمة الأسئلة:' : 'Could not refresh the question list:'} ${refreshFailure.message}`);
          }
        }
      }
    } finally {
      setImportBusy(false);
    }
  }
  async function updateCard(value) {
    try {
      await api(`/interviews/topics/${topic.id}/cards/${value.id}`, { method: 'PUT', body: value });
      setEditingCard(null);
      const result = await api(`/interviews/topics/${topic.id}/cards?page=${bankPage}&pageSize=50`);
      setTopic(current => ({ ...current, cards: result.cards }));
      setBankMeta(result);
      setBankPage(result.page);
    } catch (failure) { setError(failure.message); }
  }
  async function startQuiz(modeOverride) {
    const mode = ['random', 'unpracticed', 'needs_work'].includes(modeOverride) ? modeOverride : practiceMode;
    try {
      const result = await api(`/interviews/topics/${topic.id}/practice-sessions`, {
        method: 'POST',
        body: {
          mode,
          count: questionCount,
          time_limit_seconds: timeLimit,
          difficulty: practiceDifficulty,
          tag: practiceTag.trim(),
        },
      });
      setPracticeSummary(null);
      setRevealed(false);
      setResponseRating('');
      setRecordingError('');
      setQuiz({
        ...result,
        current: 0,
        paused: false,
        elapsedSeconds: 0,
        currentElapsedSeconds: 0,
        remainingSeconds: result.time_limit_seconds || null,
        response: '',
      });
      setSection('cards');
    }
    catch (failure) { setError(failure.message); }
  }
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setRecordingError(language === 'ar' ? 'التسجيل الصوتي غير مدعوم في هذا المتصفح؛ يمكنك كتابة إجابتك.' : 'Audio recording is not supported here; you can type your answer instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size) setRecordedAudio(current => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
      setRecordingError('');
    } catch (failure) {
      setRecordingError(language === 'ar'
        ? `تعذر بدء التسجيل: ${failure.message || 'تحقق من صلاحية الميكروفون.'}`
        : `Could not start recording: ${failure.message || 'Check microphone permission.'}`);
    }
  }
  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }
  function togglePause() {
    setQuiz(current => {
      if (!current) return current;
      const paused = !current.paused;
      if (recorderRef.current?.state === 'recording' && paused) recorderRef.current.pause();
      else if (recorderRef.current?.state === 'paused' && !paused) recorderRef.current.resume();
      return { ...current, paused, remainingSeconds: current.remainingSeconds === 0 ? 30 : current.remainingSeconds };
    });
  }
  async function savePracticeResponse(rating) {
    if (!quiz) return false;
    const card = quiz.cards[quiz.current];
    try {
      await api(`/interviews/practice-sessions/${quiz.id}/responses/${card.id}`, {
        method: 'PUT',
        body: { rating, response: quiz.response, elapsed_seconds: quiz.currentElapsedSeconds },
      });
      setResponseRating(rating);
      return true;
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
      return false;
    }
  }
  async function advancePractice(rating = responseRating) {
    if (!quiz || !rating) return;
    if (responseRating !== rating && !await savePracticeResponse(rating)) return;
    if (quiz.current + 1 >= quiz.cards.length) {
      try {
        const summary = await api(`/interviews/practice-sessions/${quiz.id}/complete`, {
          method: 'POST',
          body: { elapsed_seconds: quiz.elapsedSeconds },
        });
        setPracticeSummary(summary);
        setQuiz(null);
        await loadTopics();
        await loadPracticeHistory(topic.id);
      } catch (failure) {
        if (failure.status === 401) onUnauthorized();
        else setError(failure.message);
      }
      return;
    }
    setQuiz(current => current ? { ...current, current: current.current + 1, currentElapsedSeconds: 0, response: '' } : current);
    setRevealed(false);
    setResponseRating('');
    if (recordedAudio) URL.revokeObjectURL(recordedAudio);
    setRecordedAudio('');
  }
  async function finishPractice() {
    if (!quiz) return;
    try {
      const summary = await api(`/interviews/practice-sessions/${quiz.id}/complete`, {
        method: 'POST',
        body: { elapsed_seconds: quiz.elapsedSeconds },
      });
      setPracticeSummary(summary);
      setQuiz(null);
      await loadTopics();
      await loadPracticeHistory(topic.id);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }
  async function reloadApplication(id) {
    const rows = await api('/interviews');
    setApplication(rows.find(row => row.id === id) || null);
  }
  async function saveRound(value) {
    try {
      await api(editingRound?.id
        ? `/interviews/${application.id}/rounds/${editingRound.id}`
        : `/interviews/${application.id}/rounds`, { method: editingRound?.id ? 'PUT' : 'POST', body: value });
      setEditingRound(null);
      await reloadApplication(application.id);
    } catch (failure) { setError(failure.message); }
  }
  async function deleteRound(roundId) {
    try { await api(`/interviews/${application.id}/rounds/${roundId}`, { method: 'DELETE' }); await reloadApplication(application.id); }
    catch (failure) { setError(failure.message); }
  }
  async function deleteCard(cardId) {
    try {
      await api(`/interviews/topics/${topic.id}/cards/${cardId}`, { method: 'DELETE' });
      const result = await api(`/interviews/topics/${topic.id}/cards?page=${bankPage}&pageSize=50`);
      setTopic(current => ({ ...current, cards: result.cards }));
      setBankMeta(result);
      setBankPage(result.page);
      await loadTopics();
    } catch (failure) { setError(failure.message); }
  }
  return <>
    <section className="page-card">
      <header className="page-heading"><div><p className="eyebrow">CAREER WORKSPACE</p><h1>{t.interviews}</h1><p>نظّم فرصك، واستعد للمقابلة بخطة واضحة.</p></div></header>
      <div className="interview-tabs" role="tablist" aria-label="أقسام المقابلات">
        <button role="tab" aria-selected={section === 'applications'} className={`interview-tab ${section === 'applications' ? 'active' : ''}`} onClick={() => setSection('applications')}><span aria-hidden="true">▣</span> طلبات التوظيف</button>
        <button role="tab" aria-selected={section === 'cards'} className={`interview-tab ${section === 'cards' ? 'active' : ''}`} onClick={() => setSection('cards')}><span aria-hidden="true">✧</span> محاكاة المقابلات</button>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
    </section>
    {section === 'applications' ? application ? <section className="page-card application-detail">
      <header className="page-heading"><div><button className="button button-quiet" onClick={() => { setApplication(null); setEditingRound(null); }}>← العودة للطلبات</button><p className="eyebrow">APPLICATION DETAILS</p><h2>{application.company}</h2><p>{application.role} · {application.applied_on || ''}</p></div>
        <span className={`application-status ${application.status}`}>{({ applied: 'تم التقديم', screening: 'فرز أولي', interviewing: 'مقابلات', offer: 'عرض وظيفي', rejected: 'مرفوض', withdrawn: 'منسحب' })[application.status] || application.status}</span></header>
      {application.job_url && <a href={application.job_url} target="_blank" rel="noreferrer">رابط الوظيفة</a>}
      <p>{application.notes}</p>
      <button className="button button-primary" onClick={() => setEditingRound({})}>＋ جولة مقابلة</button>
      {editingRound !== null && <Editor fields={roundFields} value={editingRound} language={language} onSubmit={saveRound} onCancel={() => setEditingRound(null)} onUnauthorized={onUnauthorized} />}
      <div className="interview-round-list">{(application.rounds || []).map((round, index) => <article className="interview-round" key={round.id}>
        <span className="round-index">{String(index + 1).padStart(2, '0')}</span><div className="interview-round-content">
          <header><div><h3>{round.round_name || `الجولة ${index + 1}`}</h3><time>{round.scheduled_start || round.occurred_on || ''}</time></div><div className="record-actions"><ActionIcon action="edit" label={`تعديل الجولة: ${round.round_name || index + 1}`} onClick={() => setEditingRound(round)} /><ActionIcon action="delete" label={`حذف الجولة: ${round.round_name || index + 1}`} onClick={() => deleteRound(round.id)} /></div></header>
          <div className="round-notes-grid">
            {round.questions_answers && <section><h4>أسئلة المقابلة وإجاباتك</h4><p>{round.questions_answers}</p></section>}
            {round.questions_for_them && <section><h4>أسئلة تطرحها عليهم</h4><p>{round.questions_for_them}</p></section>}
            {round.experience && <section><h4>ملاحظاتك وما تعلمته</h4><p>{round.experience}</p></section>}
            {round.follow_up && <section><h4>الخطوة التالية</h4><p>{round.follow_up}</p></section>}
          </div>
        </div>
      </article>)}</div>
    </section> : <CollectionPage config={{ ...collections.interviews, open: setApplication }} language={language} onUnauthorized={onUnauthorized} /> : (
      <section className={`page-card mock-interview-workspace ${quiz ? 'mock-in-session' : ''}`}>
        {!topic ? <>
          <header className="mock-welcome">
            <div><p className="eyebrow">{language === 'ar' ? 'تدرّب بتركيز، وتقدّم بثقة' : 'PRACTICE WITH PURPOSE'}</p>
              <h2>{language === 'ar' ? 'ما الذي تريد الاستعداد له؟' : 'What would you like to prepare for?'}</h2>
              <p>{language === 'ar' ? 'اختر مجموعة أسئلة أو أنشئ واحدة لمجال محدد.' : 'Choose a question set or create one for a specific skill.'}</p></div>
            <button className="button button-primary" type="button" onClick={() => setAdding(true)}>＋ {language === 'ar' ? 'مجموعة جديدة' : 'New question set'}</button>
          </header>
          {adding && <div className="mock-inline-form"><Editor fields={topicFields} language={language} onSubmit={addTopic} onCancel={() => setAdding(false)} onUnauthorized={onUnauthorized} /></div>}
          {topics.length ? <div className="topic-grid">{topics.map((row, index) => <button className="topic-deck" type="button" key={row.id} onClick={() => openTopic(row)}>
            <span className="topic-deck-icon" aria-hidden="true">{['◈', '⌘', '⌁', '✧'][index % 4]}</span>
            <span className="topic-deck-copy"><strong>{row.title}</strong>
              <small>{row.card_count} {language === 'ar' ? 'سؤال' : 'questions'} · {row.practice_count || 0} {language === 'ar' ? 'جلسة تدريب' : 'practice sessions'}</small>
              {row.last_practiced && <small>{language === 'ar' ? 'آخر تدريب' : 'Last practiced'} · {new Date(row.last_practiced).toLocaleDateString(language === 'ar' ? 'ar' : 'en')}</small>}
            </span><span className="topic-deck-arrow" aria-hidden="true">←</span>
          </button>)}</div> : !adding && <div className="mock-empty-state">
            <span aria-hidden="true">✧</span><h3>{language === 'ar' ? 'ابدأ بأول مجموعة أسئلة' : 'Start with your first question set'}</h3>
            <p>{language === 'ar' ? 'افصل الأسئلة حسب مهارة أو مقابلة، ثم تدرب عليها في جلسات قصيرة.' : 'Organize questions by skill or interview, then practice them in focused sessions.'}</p>
            <button className="button button-primary" type="button" onClick={() => setAdding(true)}>{language === 'ar' ? 'إنشاء مجموعة' : 'Create a question set'}</button>
          </div>}
        </> : <>
          <header className="mock-topic-heading">
            <div><button className="mock-back-link" type="button" onClick={() => { setTopic(null); setQuiz(null); setPracticeSummary(null); }}>{language === 'ar' ? '← كل المجموعات' : '← All question sets'}</button>
              <p className="eyebrow">{language === 'ar' ? 'مجموعة التدريب' : 'QUESTION SET'}</p><h2>{topic.title}</h2>
              <p>{bankMeta.total} {language === 'ar' ? 'سؤال متاح' : 'questions available'}</p></div>
            {!quiz && <div className="mock-topic-actions">
              <button className="button button-quiet" type="button" onClick={() => { setAdding(false); setImportOpen(value => !value); setImportError(''); setImportResult(null); }}>
                ⇧ {language === 'ar' ? 'استيراد أسئلة' : 'Import questions'}
              </button>
              <button className="button button-primary" type="button" onClick={() => { setImportOpen(false); setAdding(true); }}>＋ {language === 'ar' ? 'إضافة سؤال' : 'Add question'}</button>
            </div>}
          </header>

          {importResult && <p className="notice" role="status">
            {language === 'ar'
              ? `تم استيراد ${importResult.imported} سؤالاً${importResult.duplicates ? `، وتجاهل ${importResult.duplicates} سؤال مكرر` : ''}.`
              : `Imported ${importResult.imported} question${importResult.imported === 1 ? '' : 's'}${importResult.duplicates ? `; skipped ${importResult.duplicates} duplicate${importResult.duplicates === 1 ? '' : 's'}` : ''}.`}
          </p>}
          {importOpen && <section className="question-import-panel" aria-label={language === 'ar' ? 'استيراد الأسئلة' : 'Import questions'}>
            <header><div><h3>{language === 'ar' ? 'استيراد من ملف أو لصق البيانات' : 'Import from a file or paste data'}</h3>
              <p>{language === 'ar' ? 'يدعم CSV وJSON. ستظهر معاينة قبل الإضافة، والأسئلة المكررة تُتجاهل.' : 'CSV and JSON are supported. Review a preview before adding; duplicate questions are skipped.'}</p></div>
              <button className="button button-quiet" type="button" onClick={() => { setImportOpen(false); setImportRows([]); setImportError(''); }}>{language === 'ar' ? 'إغلاق' : 'Close'}</button>
            </header>
            <div className="question-import-controls">
              <label>{language === 'ar' ? 'تنسيق البيانات' : 'Data format'}
                <select value={importFormat} onChange={event => { setImportFormat(event.target.value); setImportRows([]); setImportError(''); }}>
                  <option value="csv">CSV</option><option value="json">JSON</option>
                </select>
              </label>
              <label className="question-import-file">{language === 'ar' ? 'اختيار ملف' : 'Choose file'}
                <input type="file" accept=".csv,.json,text/csv,application/json" onChange={readQuestionImportFile} />
              </label>
              {importFormat === 'csv' && <button className="button button-quiet" type="button" onClick={downloadQuestionTemplate}>{language === 'ar' ? 'تنزيل قالب CSV' : 'Download CSV template'}</button>}
            </div>
            <label className="question-import-data">{language === 'ar' ? 'الصق CSV أو JSON هنا' : 'Paste CSV or JSON here'}
              <textarea rows="7" spellCheck="false" value={importText} onChange={event => { setImportText(event.target.value); setImportRows([]); setImportError(''); }}
                placeholder={importFormat === 'csv'
                  ? 'question,answer,answer_notes,tags,difficulty\n"How would you design a cache?","Use an eviction policy...","Discuss trade-offs.","system design",intermediate'
                  : '[{"question":"How would you design a cache?","answer":"Use an eviction policy...","answer_notes":"Discuss trade-offs.","tags":["system design"],"difficulty":"intermediate"}]'} />
            </label>
            <p className="question-import-help">{language === 'ar'
              ? 'الأعمدة المطلوبة: question وanswer. الأعمدة الاختيارية: answer_notes وtags وdifficulty. الصعوبة: beginner أو intermediate أو advanced.'
              : 'Required fields: question and answer. Optional: answer_notes, tags, difficulty. Difficulty values: beginner, intermediate, advanced.'}</p>
            {importError && <p className="notice error" role="alert">{importError}</p>}
            {importRows.length > 0 && <div className="question-import-preview" role="status">
              <strong>{language === 'ar' ? `معاينة ${importRows.length} سؤال` : `Previewing ${importRows.length} question${importRows.length === 1 ? '' : 's'}`}</strong>
              <div>{importRows.slice(0, 5).map((card, index) => <article key={`${index}-${card.question}`}>
                <span>{index + 1}</span><div><b>{card.question}</b><small>{card.difficulty} · {card.tags.join(', ') || (language === 'ar' ? 'بلا وسوم' : 'No tags')}</small></div>
              </article>)}</div>
              {importRows.length > 5 && <small>{language === 'ar' ? `و${importRows.length - 5} أسئلة أخرى…` : `and ${importRows.length - 5} more…`}</small>}
            </div>}
            <footer><span>{language === 'ar' ? 'الحد الأقصى 500 سؤال لكل استيراد.' : 'Up to 500 questions per import.'}</span>
              {importRows.length === 0
                ? <button className="button button-primary" type="button" disabled={!importText.trim()} onClick={prepareQuestionImport}>{language === 'ar' ? 'معاينة الأسئلة' : 'Preview questions'}</button>
                : <button className="button button-primary" type="button" disabled={importBusy} onClick={importQuestions}>
                  {importBusy ? (language === 'ar' ? 'جارٍ الاستيراد…' : 'Importing…') : (language === 'ar' ? `استيراد ${importRows.length} سؤال` : `Import ${importRows.length} questions`)}
                </button>}
            </footer>
          </section>}

          {practiceSummary && <section className="practice-summary" aria-live="polite">
            <div><p className="eyebrow">{language === 'ar' ? 'انتهت الجلسة' : 'SESSION COMPLETE'}</p>
              <h3>{language === 'ar' ? 'تدريب جيد — راجع ما تريد تحسينه.' : 'Nice work. Review what you want to improve.'}</h3>
              <p>{practiceSummary.elapsed_seconds} {language === 'ar' ? 'ثانية تدريب' : 'seconds practiced'} · {practiceSummary.answered}/{practiceSummary.question_count} {language === 'ar' ? 'إجابة مصنفة' : 'rated responses'}</p></div>
            <div className="practice-summary-stats">
              <span><strong>{practiceSummary.strong}</strong>{language === 'ar' ? 'قوية' : 'Strong'}</span>
              <span><strong>{practiceSummary.needs_work}</strong>{language === 'ar' ? 'للمراجعة' : 'Needs work'}</span>
              <span><strong>{practiceSummary.skipped}</strong>{language === 'ar' ? 'تم تجاوزها' : 'Skipped'}</span>
            </div>
            {practiceSummary.needs_work > 0 && <button className="button button-primary" type="button" onClick={() => {
              setPracticeMode('needs_work');
              setPracticeSummary(null);
              startQuiz('needs_work');
            }}>{language === 'ar' ? 'تدرّب على الأسئلة التي تحتاج مراجعة' : 'Practice questions that need work'}</button>}
          </section>}

          {adding && <div className="mock-inline-form">
            <Editor fields={localizedCardFields} language={language} onSubmit={addCard}
              onCancel={() => { setAdding(false); setEditingCard(null); }}
              onUnauthorized={onUnauthorized} />
          </div>}

          {quiz ? (() => {
            const card = quiz.cards[quiz.current];
            const remaining = quiz.remainingSeconds === null ? null : `${String(Math.floor(quiz.remainingSeconds / 60)).padStart(2, '0')}:${String(quiz.remainingSeconds % 60).padStart(2, '0')}`;
            const canReveal = !recording && Boolean(quiz.response.trim() || recordedAudio);
            return <article className="practice-session" aria-live="polite">
              <header className="practice-session-header">
                <div><span className="eyebrow">{language === 'ar' ? 'جلسة تدريب' : 'PRACTICE SESSION'}</span>
                  <strong>{quiz.current + 1} / {quiz.cards.length}</strong></div>
                <div className="practice-session-actions">
                  {remaining !== null && <span className={`practice-timer ${remaining === '00:00' ? 'expired' : ''}`} aria-live="off">◷ {remaining}</span>}
                  <button className="button button-quiet" type="button" onClick={togglePause} aria-pressed={quiz.paused}>
                    {quiz.paused
                      ? quiz.remainingSeconds === null
                        ? (language === 'ar' ? 'استئناف' : 'Resume')
                        : (language === 'ar' ? 'استئناف + ٣٠ ث' : 'Resume +30 sec')
                      : (language === 'ar' ? 'إيقاف مؤقت' : 'Pause')}
                      </button>
                  <button className="button button-quiet" type="button" disabled={recording} onClick={finishPractice}>{language === 'ar' ? 'إنهاء الجلسة' : 'Finish session'}</button>
                </div>
              </header>
              <div className="quiz-progress-track"><span style={{ width: `${(quiz.current + 1) / quiz.cards.length * 100}%` }} /></div>
              {quiz.paused && <p className="practice-paused" role="status">{language === 'ar' ? 'الجلسة متوقفة مؤقتاً. استأنف عندما تكون جاهزاً.' : 'Paused. Resume when you’re ready.'}</p>}
              <div className="practice-question-meta">
                <span>{({ beginner: language === 'ar' ? 'مبتدئ' : 'Beginner', intermediate: language === 'ar' ? 'متوسط' : 'Intermediate', advanced: language === 'ar' ? 'متقدم' : 'Advanced' })[card.difficulty]}</span>
                {(card.tags || []).map(tag => <span key={tag}>{tag}</span>)}
              </div>
              <h3 className="practice-question">{card.question}</h3>
              <label className="practice-response-label" htmlFor="practice-response">{language === 'ar' ? 'فكّر بصوت عالٍ أو دوّن إجابتك' : 'Think aloud or draft your answer'}</label>
              <textarea id="practice-response" dir="auto" rows="5" value={quiz.response}
                disabled={quiz.paused || revealed}
                placeholder={language === 'ar' ? 'اكتب إجابتك هنا… يمكنك أيضاً تسجيلها صوتياً.' : 'Write your answer here… You can also record it.'}
                onChange={event => setQuiz(current => current ? { ...current, response: event.target.value } : current)} />
              <div className="practice-response-tools">
                {!recording ? <button className="button button-quiet" type="button" disabled={quiz.paused || revealed} onClick={startRecording}>● {language === 'ar' ? 'تسجيل صوتي' : 'Record answer'}</button>
                  : <button className="button button-danger" type="button" onClick={stopRecording}>■ {language === 'ar' ? 'إيقاف التسجيل' : 'Stop recording'}</button>}
                {recordedAudio && <audio controls src={recordedAudio} aria-label={language === 'ar' ? 'استمع لإجابتك المسجلة' : 'Play your recorded answer'} />}
                <span>{language === 'ar' ? 'التسجيل يبقى في هذه الجلسة فقط.' : 'Recording stays in this session only.'}</span>
              </div>
              {recordingError && <p className="notice error" role="alert">{recordingError}</p>}
              {!revealed ? <div className="practice-reveal-row">
                <button className="button button-primary" type="button" disabled={!canReveal || quiz.paused}
                  onClick={() => setRevealed(true)}>{language === 'ar' ? 'أظهِر الإجابة النموذجية' : 'Reveal sample answer'}</button>
                <button className="button button-quiet" type="button" disabled={recording} onClick={() => advancePractice('skip')}>{language === 'ar' ? 'تجاوز السؤال' : 'Skip question'}</button>
              </div> : <section className="practice-model-answer">
                <h4>{language === 'ar' ? 'إجابة مقترحة' : 'Sample answer'}</h4>
                <p dir="auto">{card.answer}</p>
                {card.answer_notes && <aside><strong>{language === 'ar' ? 'نقاط تذكّر' : 'Answer notes'}</strong><p dir="auto">{card.answer_notes}</p></aside>}
                <div className="practice-rating">
                  <span>{language === 'ar' ? 'كيف تقيّم إجابتك؟' : 'How did your answer go?'}</span>
                  <button className={`practice-rating-button strong ${responseRating === 'strong' ? 'selected' : ''}`} type="button"
                    onClick={() => savePracticeResponse('strong')}>{language === 'ar' ? 'قوية' : 'Strong'}</button>
                  <button className={`practice-rating-button needs-work ${responseRating === 'needs_work' ? 'selected' : ''}`} type="button"
                    onClick={() => savePracticeResponse('needs_work')}>{language === 'ar' ? 'تحتاج مراجعة' : 'Needs work'}</button>
                </div>
                {responseRating && <button className="button button-primary" type="button" onClick={() => advancePractice()}>
                  {quiz.current + 1 < quiz.cards.length ? (language === 'ar' ? 'السؤال التالي →' : 'Next question →') : (language === 'ar' ? 'إنهاء ومراجعة' : 'Finish & review')}
                </button>}
              </section>}
            </article>;
          })() : <>
            <section className="practice-setup">
              <div className="practice-setup-heading"><div><p className="eyebrow">{language === 'ar' ? 'ابدأ جلسة جديدة' : 'SET UP A SESSION'}</p>
                <h3>{language === 'ar' ? 'تدريب يناسب وقتك وهدفك' : 'Practice for your goal'}</h3></div></div>
              <div className="practice-setup-grid">
                <label>{language === 'ar' ? 'وضع التدريب' : 'Practice mode'}<select value={practiceMode} onChange={event => setPracticeMode(event.target.value)}>
                  <option value="random">{language === 'ar' ? 'أسئلة عشوائية' : 'Random questions'}</option>
                  <option value="unpracticed">{language === 'ar' ? 'أسئلة لم أتدرب عليها' : 'Unpracticed questions'}</option>
                  <option value="needs_work">{language === 'ar' ? 'أسئلة تحتاج مراجعة' : 'Needs work'}</option>
                </select></label>
                <label>{language === 'ar' ? 'عدد الأسئلة' : 'Question count'}<select value={questionCount} onChange={event => setQuestionCount(event.target.value)}>
                  <option value="5">5</option><option value="10">10</option><option value="20">20</option><option value="all">{language === 'ar' ? 'كل المطابقة' : 'All matching'}</option>
                </select></label>
                <label>{language === 'ar' ? 'الصعوبة' : 'Difficulty'}<select value={practiceDifficulty} onChange={event => setPracticeDifficulty(event.target.value)}>
                  <option value="">{language === 'ar' ? 'كل المستويات' : 'Any difficulty'}</option>
                  <option value="beginner">{language === 'ar' ? 'مبتدئ' : 'Beginner'}</option><option value="intermediate">{language === 'ar' ? 'متوسط' : 'Intermediate'}</option><option value="advanced">{language === 'ar' ? 'متقدم' : 'Advanced'}</option>
                </select></label>
                <label>{language === 'ar' ? 'وسم اختياري' : 'Optional tag'}<input value={practiceTag} onChange={event => setPracticeTag(event.target.value)} placeholder={language === 'ar' ? 'مثال: سلوكي' : 'e.g. behavioral'} /></label>
                <label>{language === 'ar' ? 'مؤقت لكل سؤال' : 'Time per question'}<select value={timeLimit} onChange={event => setTimeLimit(Number(event.target.value))}>
                  <option value={0}>{language === 'ar' ? 'بدون مؤقت' : 'No timer'}</option><option value={30}>30 {language === 'ar' ? 'ثانية' : 'seconds'}</option><option value={60}>1 {language === 'ar' ? 'دقيقة' : 'minute'}</option><option value={90}>90 {language === 'ar' ? 'ثانية' : 'seconds'}</option><option value={120}>2 {language === 'ar' ? 'دقيقة' : 'minutes'}</option><option value={180}>3 {language === 'ar' ? 'دقائق' : 'minutes'}</option>
                </select></label>
              </div>
              <div className="practice-start-row"><span>{language === 'ar' ? 'المؤقت اختياري ويمكن تمديده أثناء التدريب.' : 'Timer is optional and can be extended during practice.'}</span>
                <button className="button button-primary practice-start-button" type="button" disabled={!bankMeta.total} onClick={() => startQuiz()}>▶ {language === 'ar' ? 'ابدأ التدريب' : 'Start practice'}</button>
              </div>
            </section>

            {practiceSummary && <section className="practice-summary" aria-live="polite">
              <div><p className="eyebrow">{language === 'ar' ? 'ملخص الجلسة السابقة' : 'LAST SESSION'}</p>
                <h3>{language === 'ar' ? 'تم حفظ تقدمك' : 'Your progress is saved'}</h3>
                <p>{practiceSummary.elapsed_seconds} {language === 'ar' ? 'ثانية' : 'seconds'} · {practiceSummary.answered} {language === 'ar' ? 'إجابة' : 'responses'}</p></div>
              <div className="practice-summary-stats"><span><strong>{practiceSummary.strong}</strong>{language === 'ar' ? 'قوية' : 'Strong'}</span><span><strong>{practiceSummary.needs_work}</strong>{language === 'ar' ? 'للمراجعة' : 'Needs work'}</span><span><strong>{practiceSummary.skipped}</strong>{language === 'ar' ? 'تجاوز' : 'Skipped'}</span></div>
            </section>}

            {practiceHistory.length > 0 && <details className="practice-history">
              <summary>{language === 'ar' ? `سجل التدريب · ${practiceHistory.length} جلسة` : `Practice history · ${practiceHistory.length} sessions`}</summary>
              <div className="practice-history-list">{practiceHistory.map(session => <article key={session.id}>
                <strong>{new Date(session.started_at).toLocaleString(language === 'ar' ? 'ar' : 'en')}</strong>
                <span>{session.answered}/{session.question_count} {language === 'ar' ? 'إجابة' : 'responses'}</span>
                <span>{session.strong} {language === 'ar' ? 'قوية' : 'strong'} · {session.needs_work} {language === 'ar' ? 'للمراجعة' : 'needs work'} · {session.skipped} {language === 'ar' ? 'تجاوز' : 'skipped'}</span>
              </article>)}</div>
            </details>}

            {adding && <div className="mock-inline-form"><Editor fields={localizedCardFields} language={language} onSubmit={addCard} onCancel={() => setAdding(false)} onUnauthorized={onUnauthorized} /></div>}
            {editingCard && <div className="mock-inline-form"><Editor fields={localizedCardFields} value={{ ...editingCard, tags: (editingCard.tags || []).join(', ') }} language={language} onSubmit={value => updateCard({ ...value, id: editingCard.id })}
              onCancel={() => setEditingCard(null)} onUnauthorized={onUnauthorized} /></div>}

            <section className="question-bank">
              <header className="question-bank-heading"><div><p className="eyebrow">{language === 'ar' ? 'مكتبة الأسئلة' : 'QUESTION BANK'}</p>
                <h3>{language === 'ar' ? 'راجع مجموعتك ورتّبها' : 'Browse and organize your questions'}</h3>
                <p>{bankMeta.total} {language === 'ar' ? 'سؤال' : 'questions'}</p></div></header>
              <div className="question-bank-filters">
                <input aria-label={language === 'ar' ? 'بحث عن سؤال' : 'Search questions'} placeholder={language === 'ar' ? 'ابحث في السؤال أو الإجابة أو الوسوم…' : 'Search questions, answers, or tags…'}
                  value={cardSearch} onChange={event => { setCardSearch(event.target.value); setBankPage(1); }} />
                <input aria-label={language === 'ar' ? 'تصفية حسب الوسم' : 'Filter by tag'} placeholder={language === 'ar' ? 'وسم محدد' : 'Exact tag'}
                  value={tagFilter} onChange={event => { setTagFilter(event.target.value); setBankPage(1); }} />
                <select aria-label={language === 'ar' ? 'تصفية حسب الصعوبة' : 'Filter by difficulty'} value={difficultyFilter}
                  onChange={event => { setDifficultyFilter(event.target.value); setBankPage(1); }}>
                  <option value="">{language === 'ar' ? 'كل الصعوبات' : 'All difficulties'}</option><option value="beginner">{language === 'ar' ? 'مبتدئ' : 'Beginner'}</option><option value="intermediate">{language === 'ar' ? 'متوسط' : 'Intermediate'}</option><option value="advanced">{language === 'ar' ? 'متقدم' : 'Advanced'}</option>
                </select>
                <select aria-label={language === 'ar' ? 'تصفية حسب حالة التدريب' : 'Filter by practice status'} value={practiceFilter}
                  onChange={event => { setPracticeFilter(event.target.value); setBankPage(1); }}>
                  <option value="">{language === 'ar' ? 'كل الأسئلة' : 'All questions'}</option><option value="unpracticed">{language === 'ar' ? 'لم يتم التدرب عليها' : 'Unpracticed'}</option><option value="needs_work">{language === 'ar' ? 'تحتاج مراجعة' : 'Needs work'}</option>
                </select>
              </div>
              {bankBusy ? <p role="status">{language === 'ar' ? 'جارٍ تحميل الأسئلة…' : 'Loading questions…'}</p>
                : topic.cards.length === 0 ? <p className="notice">{language === 'ar' ? 'لا توجد أسئلة مطابقة. جرّب إزالة بعض عوامل التصفية.' : 'No matching questions. Try clearing a filter.'}</p>
                  : <div className="question-bank-list">{topic.cards.map((card, index) => <article className="question-bank-card" key={card.id}>
                    <div className="question-bank-card-heading"><span className="question-bank-number">{(bankPage - 1) * 50 + index + 1}</span>
                      <div><h4>{card.question}</h4><div className="question-tags">
                        <span className={`difficulty-badge difficulty-${card.difficulty}`}>{({ beginner: language === 'ar' ? 'مبتدئ' : 'Beginner', intermediate: language === 'ar' ? 'متوسط' : 'Intermediate', advanced: language === 'ar' ? 'متقدم' : 'Advanced' })[card.difficulty]}</span>
                        {(card.tags || []).map(tag => <span key={tag}>{tag}</span>)}
                        {card.last_rating === 'needs_work' && <span className="needs-work-badge">{language === 'ar' ? 'تحتاج مراجعة' : 'Needs work'}</span>}
                        {card.last_rating === 'strong' && <span className="strong-badge">{language === 'ar' ? 'إجابة قوية' : 'Strong'}</span>}
                      </div></div>
                      <div className="question-bank-actions"><ActionIcon action="edit" label={`${language === 'ar' ? 'تعديل السؤال' : 'Edit question'}: ${card.question}`} onClick={() => { setAdding(false); setEditingCard(card); }} />
                        <ActionIcon action="delete" label={`${language === 'ar' ? 'حذف السؤال' : 'Delete question'}: ${card.question}`} onClick={() => deleteCard(card.id)} /></div>
                    </div>
                  </article>)}</div>}
              {bankMeta.pageCount > 1 && <nav className="flashcard-pagination" aria-label={language === 'ar' ? 'صفحات بنك الأسئلة' : 'Question bank pages'}>
                <button className="button button-quiet" type="button" disabled={bankPage <= 1} onClick={() => setBankPage(page => page - 1)}>{language === 'ar' ? 'السابق' : 'Previous'}</button>
                <span>{bankMeta.page} / {bankMeta.pageCount}</span>
                <button className="button button-quiet" type="button" disabled={bankPage >= bankMeta.pageCount} onClick={() => setBankPage(page => page + 1)}>{language === 'ar' ? 'التالي' : 'Next'}</button>
              </nav>}
            </section>
          </>}
        </>}
      </section>
    )}
  </>;
}
