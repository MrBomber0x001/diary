import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link } from '../navigation.jsx';

const initialSetup = {
  role: '',
  interviewType: 'mixed',
  difficulty: 'intermediate',
  questionLimit: '5',
  shareJobDescription: false,
  jobDescription: '',
  shareResume: false,
  resumeText: '',
  shareDataConfirmed: false,
};

export default function AIInterviewer({ language, onUnauthorized }) {
  const arabic = language === 'ar';
  const [connection, setConnection] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [setup, setSetup] = useState(initialSetup);
  const [session, setSession] = useState(null);
  const [view, setView] = useState('setup');
  const [answer, setAnswer] = useState('');
  const [lastFeedback, setLastFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [provider, history] = await Promise.all([
        api('/interviews/ai/connection'),
        api('/interviews/ai/sessions'),
      ]);
      setConnection(provider);
      setSessions(history);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }, [onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  function updateSetup(key, value) {
    setSetup(current => ({
      ...current,
      [key]: value,
      ...(['role', 'shareJobDescription', 'jobDescription', 'shareResume', 'resumeText'].includes(key)
        ? { shareDataConfirmed: false }
        : {}),
    }));
  }

  async function startInterview(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setLastFeedback(null);
    try {
      const result = await api('/interviews/ai/sessions', {
        method: 'POST',
        body: setup,
      });
      const details = await api(`/interviews/ai/sessions/${result.id}`);
      setSession(details);
      setAnswer('');
      setView('session');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(skip = false) {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/interviews/ai/sessions/${session.id}/respond`, {
        method: 'POST',
        body: { answer, skip },
      });
      setLastFeedback(result);
      setAnswer('');
      const details = await api(`/interviews/ai/sessions/${session.id}`);
      setSession(details);
      if (result.completed) setView('report');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishEarly() {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/interviews/ai/sessions/${session.id}/finish`, { method: 'POST', body: {} });
      const details = await api(`/interviews/ai/sessions/${session.id}`);
      setSession(details);
      setLastFeedback(result.report ? null : lastFeedback);
      setView('report');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function openSession(id) {
    setBusy(true);
    setError('');
    try {
      const details = await api(`/interviews/ai/sessions/${id}`);
      setSession(details);
      setAnswer('');
      setLastFeedback(null);
      setView(details.status === 'completed' ? 'report' : 'session');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession(id) {
    if (!window.confirm(arabic ? 'حذف سجل هذه الجلسة؟' : 'Delete this session history?')) return;
    try {
      await api(`/interviews/ai/sessions/${id}`, { method: 'DELETE' });
      setSessions(current => current.filter(item => item.id !== id));
      if (session?.id === id) {
        setSession(null);
        setView('setup');
      }
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  const unanswered = session?.turns?.find(turn => !turn.answered_at);
  const currentQuestion = unanswered?.question || '';
  const answeredTurns = session?.turns?.filter(turn => turn.answered_at) || [];
  const labels = {
    types: {
      behavioral: arabic ? 'سلوكي' : 'Behavioral',
      technical: arabic ? 'تقني' : 'Technical',
      system_design: arabic ? 'تصميم الأنظمة' : 'System design',
      mixed: arabic ? 'متنوع' : 'Mixed',
    },
    difficulty: {
      beginner: arabic ? 'مبتدئ' : 'Beginner',
      intermediate: arabic ? 'متوسط' : 'Intermediate',
      advanced: arabic ? 'متقدم' : 'Advanced',
    },
  };
  const historyPanel = <aside className="ai-history-panel"><header><h3>{arabic ? 'جلساتك السابقة' : 'Your sessions'}</h3><span>{sessions.length}</span></header>
    {!sessions.length ? <p className="ai-history-empty">{arabic ? 'ستظهر تقاريرك هنا بعد التدريب.' : 'Your reports will appear here after practice.'}</p>
      : <div className="ai-history-list">{sessions.map(item => <article key={item.id}>
        <button type="button" onClick={() => openSession(item.id)} disabled={busy}>
          <strong>{item.role}</strong><span>{labels.types[item.interview_type]} · {new Date(item.started_at).toLocaleDateString(arabic ? 'ar' : 'en')}</span>
          <small>{item.status === 'completed' ? (arabic ? 'مكتملة' : 'Completed') : (arabic ? 'قيد التنفيذ' : 'In progress')}
            {item.report?.overall_score ? ` · ${item.report.overall_score}/5` : ''}</small>
        </button>
        <button className="ai-history-delete" type="button" aria-label={arabic ? `حذف جلسة ${item.role}` : `Delete ${item.role} session`} onClick={() => deleteSession(item.id)}>×</button>
      </article>)}</div>}
  </aside>;

  return <section className="ai-interviewer">
    <header className="ai-interviewer-heading">
      <div><p className="eyebrow">{arabic ? 'تدريب تكيفي' : 'ADAPTIVE PRACTICE'}</p>
        <h2>{arabic ? 'المحاور الذكي' : 'AI interviewer'}</h2>
        <p>{arabic
          ? 'مقابلة واقعية سؤالاً بسؤال، تتكيف مع إجاباتك وتمنحك ملاحظات عملية.'
          : 'A realistic one-question-at-a-time interview that adapts to your answers and gives actionable feedback.'}</p></div>
      {view !== 'setup' && <button className="button button-quiet" type="button" onClick={() => { setView('setup'); setSession(null); setLastFeedback(null); }}>
        {arabic ? 'جلسة جديدة' : 'New session'}
      </button>}
    </header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {((!connection?.configured || !connection?.encryptionReady) && view === 'setup') ? <div className="ai-interviewer-layout">
      <div className="ai-interviewer-connect">
        <span aria-hidden="true">✦</span><div><strong>{arabic ? 'اربط مزود الذكاء الاصطناعي للبدء' : 'Connect your AI provider to get started'}</strong>
          <p>{connection && !connection.encryptionReady
            ? (arabic ? 'يتطلب حفظ المفتاح إعداد سر التشفير على الخادم.' : 'Saving a provider key requires the server encryption secret.')
            : (arabic ? 'أضف عنوان المزود والنموذج ومفتاح API من الإعدادات.' : 'Add your provider endpoint, model, and API key in Settings.')}</p></div>
        <Link className="button button-primary" to="/?view=settings">{arabic ? 'فتح الإعدادات' : 'Open settings'}</Link>
      </div>
      {historyPanel}
    </div> : view === 'setup' ? <div className="ai-interviewer-layout">
      <form className="ai-interviewer-setup" onSubmit={startInterview}>
        <div className="ai-session-intro"><span aria-hidden="true">✦</span><div>
          <strong>{arabic ? 'استعد لمقابلة تحاكي الواقع' : 'Practice a realistic interview'}</strong>
          <p>{arabic ? 'سيطرح المحاور سؤالاً واحداً، يستمع لإجابتك، ثم يختار سؤال متابعة مناسباً.' : 'The interviewer asks one question, evaluates your response, then chooses a relevant follow-up.'}</p>
        </div></div>
        <label>{arabic ? 'المسمى الوظيفي المستهدف' : 'Target role'}
          <input required maxLength="160" value={setup.role} onChange={event => updateSetup('role', event.target.value)}
            placeholder={arabic ? 'مثال: مهندس برمجيات أول' : 'Example: Senior Software Engineer'} />
        </label>
        <div className="ai-session-options">
          <label>{arabic ? 'نوع المقابلة' : 'Interview type'}<select value={setup.interviewType} onChange={event => updateSetup('interviewType', event.target.value)}>
            {Object.entries(labels.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>{arabic ? 'المستوى' : 'Difficulty'}<select value={setup.difficulty} onChange={event => updateSetup('difficulty', event.target.value)}>
            {Object.entries(labels.difficulty).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>{arabic ? 'عدد الأسئلة' : 'Question count'}<select value={setup.questionLimit} onChange={event => updateSetup('questionLimit', event.target.value)}>
            {[3, 5, 8].map(count => <option key={count} value={count}>{count}</option>)}
          </select></label>
        </div>
        <fieldset className="ai-context-options"><legend>{arabic ? 'معلومات اختيارية للتخصيص' : 'Optional personalization'}</legend>
          <label className="inline-checkbox"><input type="checkbox" checked={setup.shareJobDescription}
            onChange={event => updateSetup('shareJobDescription', event.target.checked)} />
            <span>{arabic ? 'أرسل وصف الوظيفة إلى مزود الذكاء الاصطناعي لهذه الجلسة' : 'Send the job description to the AI provider for this session'}</span></label>
          {setup.shareJobDescription && <textarea rows="4" maxLength="12000" value={setup.jobDescription}
            onChange={event => updateSetup('jobDescription', event.target.value)}
            placeholder={arabic ? 'الصق وصف الوظيفة هنا…' : 'Paste the job description here…'} />}
          <label className="inline-checkbox"><input type="checkbox" checked={setup.shareResume}
            onChange={event => updateSetup('shareResume', event.target.checked)} />
            <span>{arabic ? 'أرسل سيرتي الذاتية إلى مزود الذكاء الاصطناعي لهذه الجلسة' : 'Send my resume to the AI provider for this session'}</span></label>
          {setup.shareResume && <textarea rows="4" maxLength="12000" value={setup.resumeText}
            onChange={event => updateSetup('resumeText', event.target.value)}
            placeholder={arabic ? 'الصق نص السيرة الذاتية هنا…' : 'Paste your resume text here…'} />}
          <label className="inline-checkbox ai-consent"><input required type="checkbox" checked={setup.shareDataConfirmed}
            onChange={event => updateSetup('shareDataConfirmed', event.target.checked)} />
            <span>{arabic
              ? 'أوافق على إرسال المسمى الوظيفي وإعدادات المقابلة وإجاباتي إلى مزود الذكاء الاصطناعي لمعالجتها، وأفهم أن سجل الجلسة سيُحفظ في حسابي. تُرسل السيرة الذاتية ووصف الوظيفة فقط عند تحديدهما.'
              : 'I consent to sending the target role, interview settings, and my answers to the AI provider for processing, and understand this session history will be saved to my account. Resume and job-description text are sent only when selected.'}</span></label>
        </fieldset>
        <p className="ai-privacy-note">{arabic
          ? 'لا تُرسل السيرة أو وصف الوظيفة إلا عند تحديدهما. تُرسل إجاباتك إلى المزود وتُحفظ الإجابات والملاحظات في سجل حسابك. تجنب إدخال بيانات لا تريد إرسالها أو حفظها.'
          : 'Your resume and job description are sent only when selected. Your answers are sent to the provider; answers and feedback are retained in your account history. Do not include information you do not want sent or retained.'}</p>
        <button className="button button-primary" type="submit" disabled={busy || !connection.keyConfigured}>
          {busy ? (arabic ? 'جارٍ بدء الجلسة…' : 'Starting session…') : (arabic ? 'ابدأ المقابلة' : 'Start interview')}
        </button>
      </form>
      {historyPanel}
    </div> : session && view === 'session' ? <div className="ai-live-session">
      <header><div><p className="eyebrow">{arabic ? 'مقابلة مباشرة' : 'LIVE INTERVIEW'}</p>
        <h3>{session.role}</h3><span>{labels.types[session.interviewType]} · {labels.difficulty[session.difficulty]}</span></div>
        <div className="ai-session-progress">{arabic ? 'السؤال' : 'Question'} {Math.min(answeredTurns.length + 1, session.questionLimit)} / {session.questionLimit}</div>
      </header>
      <div className="ai-progress-track"><span style={{ width: `${Math.min(100, (answeredTurns.length / session.questionLimit) * 100)}%` }} /></div>
      {currentQuestion ? <section className="ai-current-question">
        <span>{arabic ? 'سؤال المحاور' : 'INTERVIEWER QUESTION'}</span><h3 dir="auto">{currentQuestion}</h3>
      </section> : <p className="notice">{arabic ? 'جارٍ استعادة الجلسة…' : 'Restoring your session…'}</p>}
      {lastFeedback && <section className="ai-answer-feedback">
        <header><h4>{arabic ? 'ملاحظات على إجابتك' : 'Feedback on your answer'}</h4><strong>{lastFeedback.score}/5</strong></header>
        <p dir="auto">{lastFeedback.feedback}</p>
        <div className="ai-feedback-columns">
          <div><strong>{arabic ? 'نقاط قوة' : 'Strengths'}</strong><ul>{lastFeedback.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
          <div><strong>{arabic ? 'للتطوير' : 'To improve'}</strong><ul>{lastFeedback.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
        </div>
      </section>}
      {currentQuestion && <label className="ai-answer-label">{arabic ? 'إجابتك' : 'Your answer'}
        <textarea dir="auto" rows="7" maxLength="12000" value={answer} disabled={busy}
          onChange={event => setAnswer(event.target.value)}
          placeholder={arabic ? 'أجب كما لو كنت في المقابلة. يمكنك استخدام STAR للأمثلة السلوكية…' : 'Answer as you would in the interview. Use STAR for behavioral examples…'} />
      </label>}
      <footer className="ai-live-actions">
        <button className="button button-primary" type="button" disabled={busy || !answer.trim()} onClick={() => submitAnswer(false)}>
          {busy ? (arabic ? 'جارٍ تحليل الإجابة…' : 'Analyzing answer…') : (arabic ? 'إرسال الإجابة' : 'Submit answer')}
        </button>
        <button className="button button-quiet" type="button" disabled={busy || !currentQuestion} onClick={() => submitAnswer(true)}>
          {arabic ? 'تجاوز السؤال' : 'Skip question'}
        </button>
        {answeredTurns.length > 0 && <button className="button button-quiet" type="button" disabled={busy} onClick={finishEarly}>
          {arabic ? 'إنهاء وإنشاء التقرير' : 'Finish and get report'}
        </button>}
      </footer>
      <p className="ai-privacy-note">{arabic ? 'سيتم حفظ الإجابات والملاحظات في سجل هذه الجلسة.' : 'Your answers and feedback will be saved in this session history.'}</p>
    </div> : session && view === 'report' ? <div className="ai-report-view">
      <header><div><p className="eyebrow">{arabic ? 'تقرير الجلسة' : 'SESSION REPORT'}</p><h3>{session.role}</h3></div>
        <strong className="ai-overall-score">{session.report?.overall_score || '–'}<small>/5</small></strong></header>
      {session.report && <>
        <p className="ai-report-summary" dir="auto">{session.report.summary}</p>
        <div className="ai-feedback-columns">
          <div><h4>{arabic ? 'نقاط قوتك' : 'Your strengths'}</h4><ul>{session.report.top_strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
          <div><h4>{arabic ? 'مجالات التركيز' : 'Focus areas'}</h4><ul>{session.report.focus_areas.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
          <div><h4>{arabic ? 'خطواتك التالية' : 'Next steps'}</h4><ul>{session.report.next_steps.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
        </div>
      </>}
      <details className="ai-transcript"><summary>{arabic ? `عرض الحوار · ${session.turns.length} أسئلة` : `Review transcript · ${session.turns.length} questions`}</summary>
        {session.turns.map(turn => <article key={turn.id}>
          <h4>{turn.position}. {turn.question}</h4>
          {turn.answer && <p><strong>{arabic ? 'إجابتك:' : 'Your answer:'}</strong> {turn.answer}</p>}
          {turn.feedback && <p><strong>{arabic ? 'ملاحظات:' : 'Feedback:'}</strong> {turn.feedback}</p>}
        </article>)}
      </details>
      <p className="ai-privacy-note">{arabic
        ? 'هذا التقرير أداة تدريبية وليس تنبؤاً بنتيجة التوظيف. راجع الملاحظات بما يناسب خبرتك وسياقك.'
        : 'This report is for practice and does not predict hiring outcomes. Review feedback in the context of your own experience.'}</p>
    </div> : <div className="ai-interviewer-layout"><p className="notice">{arabic ? 'تعذر عرض الجلسة.' : 'Could not display the session.'}</p></div>}
  </section>;
}
