import { useEffect, useState } from 'react';
import { api, todayDate } from '../api.js';
import { messages } from '../i18n.js';
import CollectionPage from './CollectionPage.jsx';
import Editor from '../components/Editor.jsx';
import { collections } from './collections.js';

export default function NotesPage({ language, onUnauthorized, section }) {
  if (section !== 'daily') return <CollectionPage config={collections[section === 'bookmarks' ? 'bookmarks' : section === 'snippets' ? 'snippets' : 'articles']} language={language} onUnauthorized={onUnauthorized} />;
  return <DailyNotePage language={language} onUnauthorized={onUnauthorized} />;
}

function DailyNotePage({ language, onUnauthorized }) {
  const [date, setDate] = useState(todayDate());
  const [note, setNote] = useState({ title: '', body: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const t = messages[language];
  useEffect(() => {
    api(`/daily-notes?date=${date}`).then(setNote).catch(failure => {
      if (failure.status === 401) onUnauthorized(); else setError(failure.message);
    });
  }, [date, onUnauthorized]);
  async function submitNote(value) {
    setNote(value);
    setError('');
    try {
      setNote(await api(`/daily-notes/${date}`, { method: 'PUT', body: value }));
      setSaved(language === 'ar' ? 'حُفظت المذكرة' : 'Note saved');
    } catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }
  return (
    <section className="page-card">
      <header className="page-heading"><div><h1>{language === 'ar' ? 'المذكرة اليومية' : 'Daily note'}</h1><p>{saved}</p></div>
        <label>{language === 'ar' ? 'التاريخ' : 'Date'}<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      </header>
      {error && <p className="notice error">{error}</p>}
      <Editor fields={[
        { key: 'title', label: language === 'ar' ? 'العنوان' : 'Title', wide: true },
        { key: 'body', label: language === 'ar' ? 'مذكرتك' : 'Your note', type: 'textarea', wide: true },
      ]} value={note} language={language} onSubmit={submitNote} onUnauthorized={onUnauthorized} submitLabel={t.save} showCancel={false} />
    </section>
  );
}
