import { lazy, Suspense, useEffect, useState } from 'react';
import { api, todayDate } from '../api.js';
import EditorDialog from './EditorDialog.jsx';

const LexicalTextEditor = lazy(() => import('./LexicalTextEditor.jsx'));
const captureTypes = ['note', 'task', 'memory'];

export default function QuickNoteWidget({ language, onUnauthorized, open, onOpenChange }) {
  const [mode, setMode] = useState('note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const isArabic = language === 'ar';
  const labels = isArabic
    ? { note: 'مذكرة اليوم', task: 'مهمة', memory: 'ذكرى' }
    : { note: 'Daily note', task: 'Task', memory: 'Memory' };

  useEffect(() => {
    if (!saved) return undefined;
    const timeout = window.setTimeout(() => setSaved(''), 2500);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  function close() {
    onOpenChange(false);
    setError('');
  }

  async function saveCapture(event) {
    event.preventDefault();
    const text = content.trim();
    const captureTitle = title.trim();
    if (saving || (mode === 'note' && !text) || (mode !== 'note' && !captureTitle)) return;
    if (mode === 'task' && text.length > 2000) {
      setError(isArabic ? 'ملاحظات المهمة يجب ألا تتجاوز ٢٠٠٠ حرف.' : 'Task details must be 2,000 characters or fewer.');
      return;
    }
    if (mode === 'memory' && text.length > 50000) {
      setError(isArabic ? 'تفاصيل الذكرى يجب ألا تتجاوز ٥٠٠٠٠ حرف.' : 'Memory details must be 50,000 characters or fewer.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (mode === 'task') {
        await api('/todos', {
          method: 'POST',
          body: { title: captureTitle, notes: text, due_date: '', due_time: '', recurrence: 'none', priority: 4 },
        });
      } else if (mode === 'memory') {
        await api('/memories', {
          method: 'POST',
          body: { title: captureTitle, memory_date: todayDate(), body: text },
        });
      } else {
        const date = todayDate();
        const current = await api(`/daily-notes?date=${date}`);
        const time = new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date());
        const entry = `${isArabic ? '• خاطرة سريعة' : '• Quick note'} · ${time}\n${text}`;
        const body = current.body ? `${current.body}\n\n${entry}` : entry;
        if (body.length > 50000) {
          setError(isArabic ? 'مساحة مذكرة اليوم ممتلئة.' : 'Today’s journal is full.');
          return;
        }
        await api(`/daily-notes/${date}`, {
          method: 'PUT',
          body: { title: current.title, body },
        });
      }
      setTitle('');
      setContent('');
      setMode('note');
      close();
      setSaved(mode);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button className="quick-note-launcher" type="button" onClick={() => { setError(''); onOpenChange(true); }}
      aria-label={isArabic ? 'إنشاء سريع' : 'Create quickly'}
      title={isArabic ? 'إنشاء سريع' : 'Quick capture'}>
      <span aria-hidden="true">＋</span>
    </button>
    {saved && <span className="quick-note-saved" role="status">
      {isArabic ? `تمت إضافة ${labels[saved]}` : `${labels[saved]} added`}
    </span>}
    {open && <EditorDialog title={isArabic ? 'إنشاء سريع' : 'Quick capture'} language={language} onClose={close}>
      <form className="quick-note-form" onSubmit={saveCapture}
        onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
        <div className="quick-capture-types" role="group" aria-label={isArabic ? 'نوع العنصر' : 'Capture type'}>
          {captureTypes.map(type => <button key={type} type="button" className={mode === type ? 'active' : ''}
            aria-pressed={mode === type} onClick={() => { setMode(type); setError(''); }}>
            {labels[type]}
          </button>)}
        </div>
        {mode !== 'note' && <>
          <label htmlFor="quick-capture-title">{mode === 'task'
            ? (isArabic ? 'عنوان المهمة' : 'Task title')
            : (isArabic ? 'عنوان الذكرى' : 'Memory title')}</label>
          <input id="quick-capture-title" className="quick-capture-title" autoFocus maxLength="200" value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder={mode === 'task' ? (isArabic ? 'ما الذي تحتاج إلى إنجازه؟' : 'What needs to get done?')
              : (isArabic ? 'ما الذكرى التي تريد حفظها؟' : 'What do you want to remember?')} />
        </>}
        <label htmlFor="quick-note-input">{mode === 'note'
          ? (isArabic ? 'اكتب خاطرتك' : 'Your thought')
          : (isArabic ? 'تفاصيل (اختياري)' : 'Details (optional)')}</label>
        <Suspense fallback={<textarea id="quick-note-input" dir="auto" rows="6" maxLength="50000" value={content}
          onChange={event => setContent(event.target.value)} placeholder={isArabic ? 'اكتب ما تريد تذكره…' : 'Capture a thought…'} />}>
          <LexicalTextEditor plainText autoFocus={mode === 'note'} value={content} onChange={setContent} language={language}
            placeholder={isArabic ? 'اكتب ما تريد تذكره…' : 'Capture a thought…'} />
        </Suspense>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="editor-actions">
          <button className="button button-primary" type="submit"
            disabled={saving || (mode === 'note' && !content.trim()) || (mode !== 'note' && !title.trim())}>
            {saving ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…')
              : (isArabic ? `حفظ ${labels[mode]}` : `Save ${labels[mode].toLowerCase()}`)}
          </button>
        </div>
      </form>
    </EditorDialog>}
  </>;
}
