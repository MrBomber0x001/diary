import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { navigate } from '../navigation.jsx';
import { messages } from '../i18n.js';

const resultSections = [
  ['items', 'library', 'library'],
  ['todos', 'tasks', 'tasks'],
  ['articles', 'articles', 'notes'],
  ['bookmarks', 'bookmarks', 'bookmarks'],
  ['memories', 'memories', 'memories'],
  ['dailyNotes', 'dailyNotes', 'daily-note'],
  ['snippets', 'snippets', 'snippets'],
  ['learning', 'learning', 'learning'],
];

function targetFor(section, record, view) {
  if (section === 'items') return `/item/${record.id}`;
  if (section === 'dailyNotes') return `/?view=daily-note&date=${encodeURIComponent(record.note_date)}`;
  return `/?view=${view}`;
}

export default function GlobalSearch({ language, onUnauthorized }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const t = messages[language];
  const isArabic = language === 'ar';

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
      document.body.classList.add('global-search-open');
    } else {
      document.body.classList.remove('global-search-open');
    }
    return () => document.body.classList.remove('global-search-open');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
      setError('');
    }
  }, [open]);

  const groups = resultSections.flatMap(([key, label, destination]) =>
    (results?.[key] || []).length ? [{ key, label, destination, rows: results[key] }] : []);
  const labels = {
    library: t.library, tasks: t.tasks, articles: isArabic ? 'المقالات' : 'Articles',
    bookmarks: isArabic ? 'الروابط المحفوظة' : 'Bookmarks', memories: t.memories,
    dailyNotes: isArabic ? 'المذكرات اليومية' : 'Daily notes',
    snippets: isArabic ? 'المقاطع البرمجية' : 'Code snippets', learning: t.learning,
  };

  async function search(event) {
    event.preventDefault();
    const term = query.trim();
    if (!term || loading) return;
    setLoading(true);
    setError('');
    try {
      setResults(await api(`/search?q=${encodeURIComponent(term)}`));
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  return <>
    <button className="button button-quiet global-search-trigger" type="button" onClick={() => setOpen(true)}
      aria-label={isArabic ? 'بحث شامل' : 'Search everything'}>
      <span aria-hidden="true">⌕</span><span>{t.search}</span><kbd>Ctrl K</kbd>
    </button>
    {open && createPortal(<div className="global-search-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title"
        dir={isArabic ? 'rtl' : 'ltr'}>
        <header className="global-search-header">
          <div><span className="global-search-eyebrow">{isArabic ? 'بحث شامل' : 'SEARCH YOUR SPACE'}</span>
            <h2 id="global-search-title">{isArabic ? 'ماذا تريد أن تجد؟' : 'What are you looking for?'}</h2>
          </div>
          <button className="global-search-close" type="button" onClick={() => setOpen(false)}
            aria-label={isArabic ? 'إغلاق البحث' : 'Close search'}>×</button>
        </header>
        <form className="global-search-form" onSubmit={search}>
          <input ref={inputRef} type="search" value={query} onChange={event => setQuery(event.target.value)}
            maxLength="200" placeholder={isArabic ? 'ابحث في المهام والملاحظات والذكريات…' : 'Search tasks, notes, memories…'}
            aria-label={isArabic ? 'عبارة البحث' : 'Search query'} />
          <button className="button button-primary" type="submit" disabled={!query.trim() || loading}>
            {loading ? t.loading : t.search}
          </button>
        </form>
        <div className="global-search-content">
          {error && <p className="notice error" role="alert">{error}</p>}
          {!results && !error && <p className="global-search-hint">{isArabic ? 'ابحث في مكتبتك ومهامك وملاحظاتك وذكرياتك.' : 'Search your library, tasks, notes, and memories.'}</p>}
          {results && !groups.length && <p className="global-search-empty">{isArabic ? 'لا توجد نتائج مطابقة.' : 'No matching results.'}</p>}
          <div className="global-search-results" aria-live="polite">
            {groups.map(group => <section key={group.key} className="global-search-group">
              <h3>{labels[group.label]}</h3>
              {group.rows.map(record => <button className="global-search-result" type="button" key={`${group.key}-${record.id}`}
                onClick={() => { navigate(targetFor(group.key, record, group.destination)); setOpen(false); }}>
                <strong>{record.title || record.name || (isArabic ? 'بدون عنوان' : 'Untitled')}</strong>
                <span>{record.memory_date || record.note_date || record.due_date || record.url || record.place || record.description || record.notes || record.body || ''}</span>
              </button>)}
            </section>)}
          </div>
        </div>
      </section>
    </div>, document.body)}
  </>;
}
