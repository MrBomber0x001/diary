import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Editor from '../components/Editor.jsx';
import { messages } from '../i18n.js';
import ActionIcon from '../components/ActionIcon.jsx';
import { useAppDialog } from '../components/AppDialogProvider.jsx';

const topicFields = [
  { key: 'title', label: 'الموضوع', required: true },
  { key: 'status', label: 'الحالة', type: 'select', options: ['exploring', 'learning', 'reviewed'] },
  { key: 'description', label: 'الوصف', type: 'textarea', wide: true },
];
const noteFields = [
  { key: 'title', label: 'عنوان الملاحظة', required: true },
  { key: 'body', label: 'المحتوى', type: 'textarea', wide: true },
];

export default function LearningPage({ language, onUnauthorized }) {
  const { confirm } = useAppDialog();
  const [topics, setTopics] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [error, setError] = useState('');
  const t = messages[language];
  const load = useCallback(async () => {
    try { setTopics(await api('/learning/topics')); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { load(); }, [load]);

  async function open(topic) {
    try { setSelected(await api(`/learning/topics/${topic.id}`)); setEditing(false); setAddingNote(false); }
    catch (failure) { setError(failure.message); }
  }
  async function saveTopic(value) {
    try { setSelected(await api(`/learning/topics/${selected.id}`, { method: 'PUT', body: value })); setEditing(false); await load(); }
    catch (failure) { setError(failure.message); }
  }
  async function addTopic(value) {
    try { const topic = await api('/learning/topics', { method: 'POST', body: value }); setTopics(current => [topic, ...current]); setSelected({ ...topic, notes: [] }); }
    catch (failure) { setError(failure.message); }
  }
  async function addNote(value) {
    try {
      await api(`/learning/topics/${selected.id}/notes`, { method: 'POST', body: value });
      setSelected(await api(`/learning/topics/${selected.id}`));
      setAddingNote(false);
      await load();
    } catch (failure) { setError(failure.message); }
  }
  async function deleteTopic(id) {
    if (!await confirm({
      title: language === 'ar' ? 'حذف الموضوع؟' : 'Delete topic?',
      message: language === 'ar' ? 'سيتم حذف الموضوع وجميع ملاحظاته وملفاته.' : 'This topic, its notes, and attached files will be deleted.',
      confirmLabel: language === 'ar' ? 'حذف الموضوع' : 'Delete topic',
      danger: true,
    })) return;
    try { await api(`/learning/topics/${id}`, { method: 'DELETE' }); setTopics(current => current.filter(row => row.id !== id)); setSelected(null); }
    catch (failure) { setError(failure.message); }
  }
  async function uploadFile(noteId, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('files', file);
    try {
      await api(`/learning/notes/${noteId}/files`, { method: 'POST', body });
      setSelected(await api(`/learning/topics/${selected.id}`));
    } catch (failure) { setError(failure.message); }
    finally { event.target.value = ''; }
  }
  return <section className="page-card workspace-section">
    <header className="page-heading"><div><h1>{t.learning}</h1><p>{topics.length} موضوع</p></div>
      {!selected && <button className="button button-primary" onClick={() => setEditing(true)}>＋ موضوع جديد</button>}
      {selected && <button className="button button-quiet" onClick={() => setSelected(null)}>← جميع الموضوعات</button>}
    </header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!selected ? <>
      {editing && <Editor fields={topicFields} language={language} onSubmit={addTopic} onCancel={() => setEditing(false)} onUnauthorized={onUnauthorized} />}
      <div className="record-grid">{topics.map(topic => <button className="record-card topic-card" type="button" key={topic.id} onClick={() => open(topic)}>
        <h3>{topic.title}</h3><p>{topic.status} · {topic.note_count} ملاحظة · {topic.file_count} ملف</p><p>{topic.description}</p>
      </button>)}</div>
    </> : <>
      <h2>{selected.title}</h2><p>{selected.description}</p>
      <div className="record-actions">
        <ActionIcon action="edit" label={`${t.edit}: ${selected.title}`} onClick={() => setEditing(!editing)} />
        <button className="button button-primary" onClick={() => setAddingNote(true)}>＋ ملاحظة</button>
        <ActionIcon action="delete" label={`${t.delete}: ${selected.title}`} onClick={() => deleteTopic(selected.id)} />
      </div>
      {editing && <Editor fields={topicFields} value={selected} language={language} onSubmit={saveTopic} onCancel={() => setEditing(false)} onUnauthorized={onUnauthorized} />}
      {addingNote && <Editor fields={noteFields} language={language} onSubmit={addNote} onCancel={() => setAddingNote(false)} onUnauthorized={onUnauthorized} />}
      <div className="record-grid">{(selected.notes || []).map(note => <article className="record-card" key={note.id}>
        <h3>{note.title}</h3><p>{note.body}</p>
        {note.files?.map(file => <p key={file.id}><a href={file.url} target="_blank" rel="noreferrer">{file.display_name}</a></p>)}
        <label>إرفاق ملف<input type="file" onChange={event => uploadFile(note.id, event)} /></label>
      </article>)}</div>
    </>}
  </section>;
}
