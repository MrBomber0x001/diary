import { lazy, Suspense, useEffect, useState } from 'react';
import { api, todayDate } from '../api.js';
import EditorDialog from './EditorDialog.jsx';

const LexicalTextEditor = lazy(() => import('./LexicalTextEditor.jsx'));
export default function QuickNoteWidget({ language, onUnauthorized }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const isArabic = language === 'ar';

  useEffect(() => {
    if (!saved) return undefined;
    const timeout = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  async function saveQuickNote(event) {
    event.preventDefault();
    const text = note.trim();
    if (!text || saving) return;
    setSaving(true);
    setError('');
    try {
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
      setNote('');
      setOpen(false);
      setSaved(true);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button className="quick-note-launcher" type="button" onClick={() => { setError(''); setOpen(true); }}
      aria-label={isArabic ? 'إضافة خاطرة سريعة' : 'Add a quick note'}
      title={isArabic ? 'خاطرة سريعة' : 'Quick note'}>
      <span aria-hidden="true">＋</span>
    </button>
    {saved && <span className="quick-note-saved" role="status">{isArabic ? 'حُفظت الخاطرة في مذكرة اليوم' : 'Saved to today’s journal'}</span>}
    {open && <EditorDialog title={isArabic ? 'خاطرة سريعة' : 'Quick note'} language={language} onClose={() => setOpen(false)}>
      <form className="quick-note-form" onSubmit={saveQuickNote}
        onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
        <label htmlFor="quick-note-input">{isArabic ? 'اكتب خاطرتك' : 'Your thought'}</label>
        <Suspense fallback={<textarea id="quick-note-input" dir="auto" rows="6" maxLength="50000" value={note}
          onChange={event => setNote(event.target.value)} placeholder={isArabic ? 'اكتب ما تريد تذكره…' : 'Capture a thought…'} />}>
          <LexicalTextEditor plainText autoFocus value={note} onChange={setNote} language={language}
            placeholder={isArabic ? 'اكتب ما تريد تذكره…' : 'Capture a thought…'} />
        </Suspense>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="editor-actions">
          <button className="button button-primary" type="submit" disabled={saving || !note.trim()}>
            {saving ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (isArabic ? 'حفظ الخاطرة' : 'Save note')}
          </button>
        </div>
      </form>
    </EditorDialog>}
  </>;
}
