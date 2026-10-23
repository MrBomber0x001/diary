import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';
import MarkdownContent from '../components/MarkdownContent.jsx';
import WritingDialog from '../components/WritingDialog.jsx';
import { messages } from '../i18n.js';
import { navigate } from '../navigation.jsx';

const progressFields = [
  { key: 'progress', label: 'التقدم', required: true },
  { key: 'note', label: 'ملاحظة', type: 'textarea', wide: true },
];
const itemTextFields = (key, label) => [
  { key, label, type: 'textarea', wide: true },
];
const chapterFields = [
  { key: 'title', label: 'عنوان الفصل', required: true },
  { key: 'notes', label: 'الملاحظات', type: 'textarea', wide: true },
];

export default function ItemDetailPage({ id, language, onUnauthorized }) {
  const [item, setItem] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('');
  const [error, setError] = useState('');
  const [expandedText, setExpandedText] = useState({});
  const t = messages[language];
  const load = useCallback(async () => {
    try {
      const record = await api(`/items/${id}`);
      setItem(record);
      const requests = [api(`/items/${id}/progress`)];
      if (record.kind === 'book') requests.push(api(`/items/${id}/chapters`));
      const [progressRows, chapterRows = []] = await Promise.all(requests);
      setHistory(progressRows);
      setChapters(chapterRows);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }, [id, onUnauthorized]);
  useEffect(() => { load(); }, [load]);

  async function saveItem(value) {
    setError('');
    try {
      setItem(await api(`/items/${id}`, { method: 'PUT', body: { ...item, ...value } }));
      setMode('');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }
  async function addProgress(value) {
    try { await api(`/items/${id}/progress`, { method: 'POST', body: value }); setMode(''); await load(); }
    catch (failure) { setError(failure.message); }
  }
  async function addChapter(value) {
    setError('');
    try {
      const chapter = await api(`/items/${id}/chapters`, { method: 'POST', body: value });
      setChapters(current => [...current, chapter]);
      setMode('');
    } catch (failure) { setError(failure.message); }
  }
  async function deleteChapter(chapterId) {
    try {
      await api(`/items/${id}/chapters/${chapterId}`, { method: 'DELETE' });
      setChapters(current => current.filter(chapter => chapter.id !== chapterId));
    } catch (failure) { setError(failure.message); }
  }

  function renderMarkdownSection(key, title, content, fieldKey) {
    const isLong = content.length > 700;
    return <section className="item-text-section" key={key}>
      <header><h2>{title}</h2><button className="button button-quiet item-text-edit" type="button" onClick={() => setMode(`edit-${fieldKey}`)}>
        {language === 'ar' ? 'تعديل' : 'Edit'}
      </button></header>
      <MarkdownContent className={isLong && !expandedText[key] ? 'markdown-collapsed' : ''}>{content}</MarkdownContent>
      {isLong && <button className="text-expand-button" type="button" aria-expanded={Boolean(expandedText[key])} onClick={() => setExpandedText(current => ({ ...current, [key]: !current[key] }))}>
        {expandedText[key] ? 'عرض أقل ↑' : 'قراءة المزيد ↓'}
      </button>}
    </section>;
  }

  function formatProgressDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
  }

  if (error && !item) return <section className="page-card notice error">{error}<p><button className="button button-quiet" onClick={() => navigate('/?view=library')}>المكتبة</button></p></section>;
  if (!item) return <section className="page-card">{t.loading}</section>;
  return (
    <section className="page-card workspace-section">
      <p><button className="button button-quiet" type="button" onClick={() => navigate('/?view=library')}>← {t.library}</button></p>
      {error && <p className="notice error" role="alert">{error}</p>}
      <header className="page-heading">
        <div><h1>{item.title}</h1><p>{[item.creator, item.kind, item.status].filter(Boolean).join(' · ')}</p></div>
        {item.cover_image && <img className="detail-cover" src={item.cover_image} alt="" />}
      </header>
      {mode === 'progress' && <Editor fields={language === 'ar' ? progressFields : [
        { key: 'progress', label: 'Progress update', required: true },
        { key: 'note', label: 'Note', type: 'textarea', wide: true },
      ]} language={language} onSubmit={addProgress} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} />}
      <div className="record-actions">
        <button className="button button-primary" onClick={() => setMode('progress')}>{language === 'ar' ? '＋ تحديث التقدم' : '＋ Log progress'}</button>
        {item.kind === 'book' && <button className="button button-quiet" onClick={() => setMode('chapter')}>{language === 'ar' ? '＋ فصل' : '＋ Chapter'}</button>}
      </div>
      {(item.review || item.kind === 'book') && renderMarkdownSection('review', language === 'ar' ? 'مراجعتك' : 'Your review', item.review || '', 'review')}
      {(item.notes || item.kind === 'book') && renderMarkdownSection('notes', item.kind === 'book'
        ? (language === 'ar' ? 'ملاحظاتك عن الكتاب' : 'Your notes on this book')
        : (language === 'ar' ? 'ملاحظاتك' : 'Your notes'), item.notes || '', 'notes')}
      {item.kind === 'book' && <section className="book-chapters"><h2>{language === 'ar' ? 'الفصول' : 'Chapters'}</h2>{chapters.length ? chapters.map(chapter => (
        <article className="book-chapter" key={chapter.id}><div className="book-chapter-title"><h3>{chapter.title}</h3><ActionIcon action="delete" label={`${t.delete}: ${chapter.title}`} onClick={() => deleteChapter(chapter.id)} /></div>
          {chapter.notes && <MarkdownContent>{chapter.notes}</MarkdownContent>}</article>
      )) : <p>{t.empty}</p>}</section>}
      <section className="item-progress-timeline">
        <header><h2>{language === 'ar' ? 'سجل التقدم' : 'Progress timeline'}</h2>
          <span>{history.length} {language === 'ar' ? 'تحديثات' : history.length === 1 ? 'update' : 'updates'}</span></header>
        {history.length ? <ol>{history.map(entry => <li key={entry.id}>
          <span className="item-progress-timeline-dot" aria-hidden="true" />
          <time dateTime={entry.logged_at}>{formatProgressDate(entry.logged_at)}</time>
          <strong>{entry.progress}</strong>
          {entry.note && <p>{entry.note}</p>}
        </li>)}</ol> : <p className="item-progress-empty">{language === 'ar' ? 'ستظهر تحديثات تقدمك هنا.' : 'Your progress updates will appear here.'}</p>}
      </section>
      {['edit-review', 'edit-notes'].includes(mode) && (() => {
        const key = mode === 'edit-review' ? 'review' : 'notes';
        const label = key === 'review'
          ? (language === 'ar' ? 'مراجعتك' : 'Your review')
          : (language === 'ar' ? 'ملاحظاتك' : 'Your notes');
        return <WritingDialog title={language === 'ar' ? `${label} عن ${item.title}` : `${label} on ${item.title}`}
          fields={itemTextFields(key, language === 'ar' ? 'اكتب هنا…' : 'Write here…')} value={item} bodyKey={key}
          language={language} onSubmit={saveItem} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} error={error} />;
      })()}
      {mode === 'chapter' && <WritingDialog title={language === 'ar' ? `فصل جديد · ${item.title}` : `New chapter · ${item.title}`}
        fields={chapterFields} value={{}} bodyKey="notes" language={language}
        onSubmit={addChapter} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} error={error} />}
    </section>
  );
}
