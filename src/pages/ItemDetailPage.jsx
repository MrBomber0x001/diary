import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';
import EditorDialog from '../components/EditorDialog.jsx';
import MarkdownContent from '../components/MarkdownContent.jsx';
import { messages } from '../i18n.js';
import { navigate } from '../navigation.jsx';
import { collections } from './collections.js';

const progressFields = [
  { key: 'progress', label: 'التقدم', required: true },
  { key: 'note', label: 'ملاحظة', type: 'textarea', wide: true },
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
    try {
      setItem(await api(`/items/${id}`, { method: 'PUT', body: value }));
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

  function renderMarkdownSection(key, title, content) {
    const isLong = content.length > 700;
    return <section className="item-text-section" key={key}>
      <h2>{title}</h2>
      <MarkdownContent className={isLong && !expandedText[key] ? 'markdown-collapsed' : ''}>{content}</MarkdownContent>
      {isLong && <button className="text-expand-button" type="button" aria-expanded={Boolean(expandedText[key])} onClick={() => setExpandedText(current => ({ ...current, [key]: !current[key] }))}>
        {expandedText[key] ? 'عرض أقل ↑' : 'قراءة المزيد ↓'}
      </button>}
    </section>;
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
      {mode === 'edit' && <EditorDialog title={item.title} language={language} onClose={() => setMode('')}>
        <Editor fields={collections.library.fields} value={item} language={language} onSubmit={saveItem} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} quickCapture />
      </EditorDialog>}
      {mode === 'progress' && <Editor fields={progressFields} language={language} onSubmit={addProgress} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} />}
      {mode === 'chapter' && <Editor fields={chapterFields} language={language} onSubmit={addChapter} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} />}
      <div className="record-actions">
        <button className="button button-primary" onClick={() => setMode('progress')}>＋ تحديث التقدم</button>
        <ActionIcon action="edit" label={`${t.edit}: ${item.title}`} onClick={() => setMode('edit')} />
        {item.kind === 'book' && <button className="button button-quiet" onClick={() => setMode('chapter')}>＋ فصل</button>}
      </div>
      {item.review && renderMarkdownSection('review', 'مراجعة', item.review)}
      {item.notes && renderMarkdownSection('notes', 'ملاحظات', item.notes)}
      {item.kind === 'book' && <section className="book-chapters"><h2>الفصول</h2>{chapters.length ? chapters.map(chapter => (
        <article className="book-chapter" key={chapter.id}><div className="book-chapter-title"><h3>{chapter.title}</h3><ActionIcon action="delete" label={`${t.delete}: ${chapter.title}`} onClick={() => deleteChapter(chapter.id)} /></div>
          {chapter.notes && <MarkdownContent>{chapter.notes}</MarkdownContent>}</article>
      )) : <p>{t.empty}</p>}</section>}
      <section><h2>سجل التقدم</h2>{history.length ? history.map(entry => <p key={entry.id}>{entry.logged_at} · {entry.progress} {entry.note && `— ${entry.note}`}</p>) : <p>{t.empty}</p>}</section>
    </section>
  );
}
