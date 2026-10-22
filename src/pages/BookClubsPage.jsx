import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Editor from '../components/Editor.jsx';
import { messages } from '../i18n.js';
import { navigate } from '../navigation.jsx';
import CollectionPage from './CollectionPage.jsx';
import { collections } from './collections.js';

const bookFields = [
  { key: 'itemId', label: 'رقم الكتاب في مكتبتك', type: 'number', required: true },
  { key: 'totalPages', label: 'إجمالي الصفحات', type: 'number', min: 0 },
];
const meetingFields = [
  { key: 'title', label: 'عنوان الاجتماع', required: true },
  { key: 'starts_at', label: 'موعد الاجتماع', type: 'datetime-local', required: true },
  { key: 'meeting_url', label: 'رابط الاجتماع', type: 'url' },
  { key: 'discussion_points', label: 'نقاط النقاش', type: 'textarea', wide: true },
];
const progressFields = [
  { key: 'status', label: 'حالة القراءة', type: 'select', options: ['reading', 'completed'] },
  { key: 'pagesRead', label: 'الصفحات المقروءة', type: 'number', min: 0 },
  { key: 'note', label: 'ملاحظة', type: 'textarea', wide: true },
];

export default function BookClubsPage({ language, onUnauthorized }) {
  const [club, setClub] = useState(null);
  const [details, setDetails] = useState(null);
  const [mode, setMode] = useState('');
  const [message, setMessage] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const t = messages[language];
  const load = useCallback(async () => {
    if (!club) return;
    try { setDetails(await api(`/book-clubs/${club.id}`)); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [club, onUnauthorized]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('clubInvite');
    if (!token) return;
    api(`/book-club-invites/${encodeURIComponent(token)}/accept`, { method: 'POST', body: {} })
      .then(result => { navigate('/?view=clubs'); setError(language === 'ar' ? `انضممت إلى ${result.name}` : `Joined ${result.name}`); })
      .catch(failure => setError(failure.message));
  }, [language]);

  async function createInvite() {
    try {
      const result = await api(`/book-clubs/${club.id}/invites`, { method: 'POST', body: {} });
      setInvite(`${window.location.origin}${result.invitePath}`);
    } catch (failure) { setError(failure.message); }
  }
  async function addBook(value) {
    try { await api(`/book-clubs/${club.id}/books`, { method: 'POST', body: value }); setMode(''); await load(); }
    catch (failure) { setError(failure.message); }
  }
  async function addMeeting(value) {
    try { await api(`/book-clubs/${club.id}/meetings`, { method: 'POST', body: value }); setMode(''); await load(); }
    catch (failure) { setError(failure.message); }
  }
  async function sendMessage(event) {
    event.preventDefault();
    try {
      await api(`/book-clubs/${club.id}/messages`, { method: 'POST', body: { content: message, type: 'chat' } });
      setMessage('');
      await load();
    } catch (failure) { setError(failure.message); }
  }
  async function updateProgress(book, value) {
    try { await api(`/book-clubs/${club.id}/books/${book.id}/progress`, { method: 'PUT', body: value }); setMode(''); await load(); }
    catch (failure) { setError(failure.message); }
  }

  return <>
    {!club ? <CollectionPage config={{
      ...collections.clubs,
      open: row => { setClub(row); setDetails(null); },
    }} language={language} onUnauthorized={onUnauthorized} /> : (
      <section className="page-card">
        <header className="page-heading"><div><h1>{details?.name || club.name}</h1><p>{details?.description || club.description}</p></div>
          <button className="button button-quiet" onClick={() => { setClub(null); setDetails(null); }}>← جميع النوادي</button>
        </header>
        {error && <p className="notice error" role="alert">{error}</p>}
        {!details ? <p>{t.loading}</p> : <>
          <div className="metric-grid">{Object.entries(details.metrics || {}).slice(0, 6).map(([key, value]) => <article className="metric-card" key={key}><strong>{value}</strong><span>{key.replaceAll('_', ' ')}</span></article>)}</div>
          <div className="record-actions">
            <button className="button button-primary" onClick={() => setMode('book')}>＋ كتاب</button>
            <button className="button button-quiet" onClick={() => setMode('meeting')}>＋ اجتماع</button>
            {details.role === 'owner' && <button className="button button-quiet" onClick={createInvite}>إنشاء دعوة</button>}
          </div>
          {invite && <p className="notice" dir="ltr">{invite}<button className="button button-quiet" onClick={() => navigator.clipboard?.writeText(invite)}>نسخ</button></p>}
          {mode === 'book' && <Editor fields={bookFields} language={language} onSubmit={addBook} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} />}
          {mode === 'meeting' && <Editor fields={meetingFields} language={language} onSubmit={addMeeting} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} />}
          {mode?.startsWith('progress:') && <Editor fields={progressFields} language={language} onSubmit={value => updateProgress(details.books.find(book => book.id === Number(mode.split(':')[1])), value)} onCancel={() => setMode('')} onUnauthorized={onUnauthorized} />}
          <h2>الكتب المشتركة</h2>
          <div className="record-grid">{details.books.map(book => <article className="record-card" key={book.id}>
            <h3>{book.title}</h3><p>{book.creator} · {book.my_status || 'reading'} · {book.my_pages_read || 0}/{book.total_pages} صفحة</p>
            <button className="button button-quiet" onClick={() => setMode(`progress:${book.id}`)}>تحديث تقدمي</button>
          </article>)}</div>
          <h2>الأعضاء</h2><p>{details.members.map(member => member.username).join(' · ')}</p>
          <h2>الاجتماعات</h2>{details.meetings.map(meeting => <article className="record-card" key={meeting.id}><h3>{meeting.title}</h3><p>{meeting.starts_at}</p>{meeting.meeting_url && <a href={meeting.meeting_url} target="_blank" rel="noreferrer">رابط الاجتماع</a>}<p>{meeting.discussion_points}</p></article>)}
          <section className="club-chat" aria-label={language === 'ar' ? 'محادثة النادي' : 'Club chat'}>
            <header className="club-chat-heading"><div><span className="club-chat-icon" aria-hidden="true">◉</span><div><h2>{language === 'ar' ? 'مساحة النقاش' : 'Discussion'}</h2><p>{language === 'ar' ? `${details.members.length} أعضاء · آخر ١٠٠ رسالة` : `${details.members.length} members · latest 100 messages`}</p></div></div></header>
            <div className="club-message-list" aria-live="polite">
              {details.messages.length ? details.messages.map(row => <article className={`club-message ${row.message_type === 'insight' ? 'club-insight' : ''}`} key={row.id}>
                <span className="club-avatar" aria-hidden="true">{(row.username || '?').slice(0, 1).toLocaleUpperCase()}</span>
                <div className="club-message-body">
                  <header><strong>{row.username}</strong><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(language === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                    {row.message_type === 'insight' && <span className="club-insight-tag">{language === 'ar' ? 'اقتباس / فكرة' : 'Insight'}</span>}</header>
                  {row.content && <p>{row.content}</p>}
                  {row.links?.map(link => <a className="club-message-link" key={link.id} href={link.url} target="_blank" rel="noreferrer">{link.title || link.url}</a>)}
                  {row.attachments?.map(file => <a className="club-message-file" key={file.id} href={file.url} target="_blank" rel="noreferrer">↗ {file.display_name}</a>)}
                </div>
              </article>) : <p className="club-chat-empty">{language === 'ar' ? 'ابدأوا النقاش حول الكتاب أو شاركوا فكرة أعجبتكم.' : 'Start discussing the book or share an insight.'}</p>}
            </div>
            <form className="club-composer" onSubmit={sendMessage}>
              <label className="sr-only" htmlFor="club-message">{language === 'ar' ? 'رسالة النادي' : 'Club message'}</label>
              <textarea id="club-message" value={message} maxLength="4000" placeholder={language === 'ar' ? 'اكتب رسالة أو فكرة للنادي…' : 'Write a message or share an insight…'} onChange={event => setMessage(event.target.value)} />
              <div><span>{message.length}/4000</span><button className="button button-primary" disabled={!message.trim()}>{language === 'ar' ? 'إرسال الرسالة' : 'Send message'} <span aria-hidden="true">↗</span></button></div>
            </form>
          </section>
        </>}
      </section>
    )}
  </>;
}
