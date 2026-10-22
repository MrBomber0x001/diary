import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Link } from '../navigation.jsx';
import { messages } from '../i18n.js';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';
import EditorDialog from '../components/EditorDialog.jsx';
import { todayDate } from '../api.js';

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (Array.isArray(value)) return value.map(displayValue).join('، ');
  if (typeof value === 'object') return Object.values(value).map(displayValue).filter(Boolean).join(' · ');
  return String(value);
}

export default function CollectionPage({ config, language, onUnauthorized, query = '' }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('open');
  const [libraryKind, setLibraryKind] = useState('all');
  const [libraryStatus, setLibraryStatus] = useState('all');
  const [libraryLayout, setLibraryLayout] = useState(() => localStorage.getItem('personal-memo-library-layout') === 'list' ? 'list' : 'grid');
  const [applicationStatus, setApplicationStatus] = useState('all');
  const [applicationPage, setApplicationPage] = useState(1);
  const [readingPage, setReadingPage] = useState(1);
  const [readingQuery, setReadingQuery] = useState('');
  const [readingMeta, setReadingMeta] = useState({ total: 0, page: 1, pageSize: 25, pageCount: 0 });
  const [quickTask, setQuickTask] = useState('');
  const [expandedRoutines, setExpandedRoutines] = useState({});
  const [copiedSnippetId, setCopiedSnippetId] = useState(null);
  const t = messages[language];
  const endpoint = typeof config.endpoint === 'function' ? config.endpoint() : config.endpoint;
  const writeEndpoint = config.writeEndpoint || (typeof config.endpoint === 'string' ? config.endpoint : null);

  useEffect(() => {
    if (config.viewType !== 'reading') return undefined;
    const timeout = window.setTimeout(() => {
      setReadingPage(1);
      setReadingQuery(filter.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [config.viewType, filter]);

  function chooseLibraryLayout(layout) {
    setLibraryLayout(layout);
    localStorage.setItem('personal-memo-library-layout', layout);
  }

  const load = useCallback(async (page = readingPage) => {
    setBusy(true);
    setError('');
    try {
      const requestEndpoint = config.viewType === 'reading'
        ? `${endpoint}?page=${page}&pageSize=25&q=${encodeURIComponent(readingQuery)}`
        : endpoint;
      const result = await api(requestEndpoint);
      if (config.viewType === 'reading' && !Array.isArray(result)) {
        setRows(result.items);
        setReadingMeta({ total: result.total, page: result.page, pageSize: result.pageSize, pageCount: result.pageCount });
        if (result.page !== page) setReadingPage(result.page);
      } else {
        const list = config.select ? config.select(result) : result;
        setRows(Array.isArray(list) ? list : []);
      }
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, [endpoint, config, onUnauthorized, readingPage, readingQuery]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = useMemo(() => {
    const term = filter.trim().toLocaleLowerCase();
    const today = todayDate();
    const currentTime = new Date().toTimeString().slice(0, 5);
    return rows.filter(row => {
      if (config.viewType === 'library') {
        if (libraryKind !== 'all' && row.kind !== libraryKind) return false;
        if (libraryStatus !== 'all' && row.status !== libraryStatus) return false;
      }
      if (config.viewType === 'tasks') {
        const overdue = row.due_date && (row.due_date < today
          || (row.due_date === today && row.due_time && row.due_time < currentTime));
        if (taskFilter === 'open' && row.completed) return false;
        if (taskFilter === 'today' && (row.completed || row.due_date !== today)) return false;
        if (taskFilter === 'upcoming' && (row.completed || !row.due_date || row.due_date <= today)) return false;
        if (taskFilter === 'overdue' && (row.completed || !overdue)) return false;
        if (taskFilter === 'completed' && !row.completed) return false;
      }
      if (config.viewType === 'applications' && applicationStatus !== 'all' && row.status !== applicationStatus) return false;
      return config.viewType === 'reading' || !term || JSON.stringify(row).toLocaleLowerCase().includes(term);
    });
  }, [applicationStatus, config.viewType, filter, libraryKind, libraryStatus, rows, taskFilter]);
  const taskDate = todayDate();
  const taskTime = new Date().toTimeString().slice(0, 5);
  const taskSummary = config.viewType === 'tasks' ? {
    open: rows.filter(row => !row.completed).length,
    today: rows.filter(row => !row.completed && row.due_date === taskDate).length,
    overdue: rows.filter(row => !row.completed && row.due_date && (row.due_date < taskDate
      || row.due_date === taskDate && row.due_time && row.due_time < taskTime)).length,
    completed: rows.filter(row => row.completed).length,
  } : null;
  const applicationSummary = config.viewType === 'applications' ? {
    total: rows.length,
    active: rows.filter(row => ['applied', 'screening', 'interviewing'].includes(row.status)).length,
    interviewing: rows.filter(row => row.status === 'interviewing').length,
    offers: rows.filter(row => row.status === 'offer').length,
  } : null;
  const applicationPages = Math.max(1, Math.ceil(filteredRows.length / 9));
  const currentApplicationPage = Math.min(applicationPage, applicationPages);
  const displayedRows = config.viewType === 'applications'
    ? filteredRows.slice((currentApplicationPage - 1) * 9, currentApplicationPage * 9)
    : filteredRows;

  async function save(value) {
    const body = config.prepare ? config.prepare(value) : value;
    try {
      const result = editing?.id
        ? await api(`${writeEndpoint}/${editing.id}`, { method: 'PUT', body })
        : await api(writeEndpoint, { method: 'POST', body });
      if (editing?.id) setRows(current => current.map(row => row.id === editing.id ? { ...row, ...result } : row));
      else setRows(current => [result, ...current]);
      if (config.viewType === 'reading') {
        const page = editing?.id ? readingPage : 1;
        if (page !== readingPage) setReadingPage(page);
        await load(page);
      }
      setEditing(null);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function remove(row) {
    if (!window.confirm(language === 'ar' ? 'هل تريد حذف هذا العنصر؟' : 'Delete this item?')) return;
    try {
      await api(`${writeEndpoint}/${row.id}`, { method: 'DELETE' });
      setRows(current => current.filter(item => item.id !== row.id));
      if (config.viewType === 'reading') {
        const page = rows.length === 1 && readingMeta.page > 1 ? readingMeta.page - 1 : readingPage;
        if (page !== readingPage) setReadingPage(page);
        await load(page);
      }
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function runAction(row) {
    try {
      await config.action.run(row, api);
      setRows(current => current.map(item => item.id === row.id ? { ...item, [config.action.updateKey]: !item[config.action.updateKey] } : item));
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }

  }

  async function toggleHabitDay(row, day) {
    const today = todayDate();
    if (day.date > today) return;
    try {
      await api(`/habits/${row.id}/log`, {
        method: 'PUT',
        body: { date: day.date, completed: !day.completed },
      });
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function toggleTask(row) {
    try {
      const result = await api(`/todos/${row.id}`, {
        method: 'PUT',
        body: config.prepare({ ...row, completed: !row.completed }),
      });
      setRows(current => current.map(item => item.id === row.id ? { ...item, ...result } : item));
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function addQuickTask(event) {
    event.preventDefault();
    const title = quickTask.trim();
    if (!title) return;
    try {
      const row = await api(writeEndpoint, { method: 'POST', body: config.prepare({ title }) });
      setRows(current => [row, ...current]);
      setQuickTask('');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  function renderTask(row) {
    const today = todayDate();
    const currentTime = new Date().toTimeString().slice(0, 5);
    const overdue = !row.completed && row.due_date && (row.due_date < today
      || (row.due_date === today && row.due_time && row.due_time < currentTime));
    return <article className={`record-card task-card ${row.completed ? 'task-completed' : ''}`} key={row.id}>
      <label className="task-check" aria-label={`${language === 'ar' ? 'تحديد اكتمال' : 'Mark complete'}: ${row.title}`}>
        <input type="checkbox" checked={Boolean(row.completed)} onChange={() => toggleTask(row)} />
        <span className="task-checkmark" aria-hidden="true">{row.completed ? '✓' : ''}</span>
      </label>
      <div className="task-card-content">
        <div className="task-card-title-row">
          <h3>{row.title}</h3>
          {overdue && <span className="task-status overdue">{language === 'ar' ? 'متأخرة' : 'Overdue'}</span>}
          {row.completed && <span className="task-status completed">{language === 'ar' ? 'مكتملة' : 'Completed'}</span>}
        </div>
        {row.notes && <p className="task-notes" dir="auto">{row.notes}</p>}
        <div className="task-meta">
          {row.due_date && <span className={overdue ? 'task-due-overdue' : ''}>◷ {row.due_date}{row.due_time ? ` · ${row.due_time}` : ''}</span>}
          {row.project_title && <span>▧ {row.project_title}</span>}
          {row.recurrence && row.recurrence !== 'none' && <span>↻ {({
            daily: language === 'ar' ? 'يومي' : 'Daily',
            weekly: language === 'ar' ? 'أسبوعي' : 'Weekly',
            monthly: language === 'ar' ? 'شهري' : 'Monthly',
            yearly: language === 'ar' ? 'سنوي' : 'Yearly',
          })[row.recurrence] || row.recurrence}</span>}
        </div>
        <div className="record-actions">
          <ActionIcon action="edit" label={`${t.edit}: ${row.title}`} onClick={() => setEditing(row)} />
          <ActionIcon action="delete" label={`${t.delete}: ${row.title}`} onClick={() => remove(row)} />
        </div>
      </div>
    </article>;
  }

  function renderHabit(row) {
    const target = row.target_per_week || (row.frequency === 'daily' ? 7 : 3);
    const count = row.completed_this_week || 0;
    const percent = Math.min(100, Math.round(count / target * 100));
    return <article className={`habit-card ${row.completed_today ? 'habit-completed' : ''}`} key={row.id}>
      <header className="habit-card-heading">
        <div><span className="habit-symbol" aria-hidden="true">{row.frequency === 'daily' ? '☼' : '◷'}</span><div>
          <h3>{row.title}</h3><p>{row.frequency === 'daily' ? (language === 'ar' ? 'عادة يومية' : 'Daily habit') : (language === 'ar' ? 'عادة أسبوعية' : 'Weekly habit')}</p>
        </div></div>
        <span className="habit-streak" title={language === 'ar' ? 'أيام متتالية' : 'Day streak'}>🔥 {row.streak || 0}</span>
      </header>
      <p className="habit-notes" dir="auto">{row.notes || '\u00a0'}</p>
      <div className="habit-week" aria-label={language === 'ar' ? 'إنجازات هذا الأسبوع' : 'Weekly check-ins'}>
        {(row.week || []).map(day => <button className="habit-day" type="button" key={day.date} title={`${day.date}${day.completed ? ' ✓' : ''}`}
          aria-label={`${day.date}: ${day.completed ? (language === 'ar' ? 'مكتمل، اضغط لإلغاء الإنجاز' : 'Completed, click to undo') : (language === 'ar' ? 'غير مكتمل، اضغط لتسجيل الإنجاز' : 'Not completed, click to log')}`}
          aria-pressed={Boolean(day.completed)} disabled={day.date > todayDate()} onClick={() => toggleHabitDay(row, day)}>
          <span>{new Date(`${day.date}T12:00:00`).toLocaleDateString(language === 'ar' ? 'ar' : 'en', { weekday: 'short' })}</span>
          <i className={day.completed ? 'done' : ''} aria-hidden="true">{day.completed ? '✓' : ''}</i>
        </button>)}
      </div>
      <div className="habit-goal-copy"><span>{language === 'ar' ? 'الهدف الأسبوعي' : 'Weekly goal'}</span><strong dir="ltr">{count} / {target}</strong></div>
      <div className="habit-goal-track" aria-label={`${percent}%`}><span style={{ width: `${percent}%` }} /></div>
      <footer className="habit-card-actions">
        <button className={`button ${row.completed_today ? 'button-quiet' : 'button-primary'}`} type="button" onClick={() => runAction(row)}>
          {row.completed_today ? (language === 'ar' ? 'تم إنجازها اليوم ✓' : 'Done today ✓') : (language === 'ar' ? 'سجّل إنجاز اليوم' : 'Log today')}
        </button>
        <ActionIcon action="edit" label={`${t.edit}: ${row.title}`} onClick={() => setEditing(row)} />
        <ActionIcon action="delete" label={`${t.delete}: ${row.title}`} onClick={() => remove(row)} />
      </footer>
    </article>;
  }

  function renderRoutine(row) {
    const expanded = Boolean(expandedRoutines[row.id]);
    const visibleSteps = expanded ? row.steps : row.steps?.slice(0, 3);
    const progress = Math.min(100, (row.completed_this_week || 0) / 7 * 100);
    return <article className={`record-card routine-card ${row.completed_today ? 'routine-completed' : ''}`} key={row.id}>
      <div className="routine-card-heading"><div className="routine-title-block"><span className="routine-icon" aria-hidden="true">✦</span><div><h3>{row.title}</h3>{row.description && <p>{row.description}</p>}</div></div>
        <span className={`routine-status ${row.completed_today ? 'done' : ''}`} aria-label={row.completed_today ? (language === 'ar' ? 'مكتمل اليوم' : 'Completed today') : (language === 'ar' ? 'لم يكتمل اليوم' : 'Not completed today')}>{row.completed_today ? '✓' : '○'}</span>
      </div>
      {visibleSteps?.length > 0 && <ol className="routine-steps">{visibleSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>}
      {(row.steps?.length || 0) > 3 && <button className="routine-more" type="button" aria-expanded={expanded} onClick={() => setExpandedRoutines(current => ({ ...current, [row.id]: !current[row.id] }))}>
        {expanded ? (language === 'ar' ? 'عرض أقل ↑' : 'Show less ↑') : (language === 'ar' ? `عرض ${row.steps.length - 3} خطوات إضافية ↓` : `Show ${row.steps.length - 3} more steps ↓`)}
      </button>}
      <div className="routine-progress"><span>{language === 'ar' ? 'إنجاز الأسبوع' : 'Weekly progress'}</span><strong>{row.completed_this_week || 0} / 7</strong></div>
      <div className="routine-progress-track" aria-label={`${Math.round(progress)}%`}><span style={{ width: `${progress}%` }} /></div>
      <div className="record-actions">
        <button className={`button ${row.completed_today ? 'button-quiet' : 'button-primary'}`} type="button" onClick={() => runAction(row)}>
          {row.completed_today ? (language === 'ar' ? 'تم اليوم ✓' : 'Completed today ✓') : (language === 'ar' ? 'إنجاز اليوم' : 'Complete today')}
        </button>
        <ActionIcon action="edit" label={`${t.edit}: ${row.title}`} onClick={() => setEditing(row)} />
        <ActionIcon action="delete" label={`${t.delete}: ${row.title}`} onClick={() => remove(row)} />
      </div>
    </article>;
  }

  function renderLibraryItem(row) {
    const kindLabels = language === 'ar'
      ? { book: 'كتاب', movie: 'فيلم', game: 'لعبة', memo: 'مذكرة' }
      : { book: 'Book', movie: 'Movie', game: 'Game', memo: 'Note' };
    const statusLabels = language === 'ar'
      ? { planned: 'مخطط له', in_progress: 'قيد المتابعة', completed: 'مكتمل', paused: 'متوقف مؤقتاً', dropped: 'متروك' }
      : { planned: 'Planned', in_progress: 'In progress', completed: 'Completed', paused: 'Paused', dropped: 'Dropped' };
    const percent = typeof row.progress === 'string' && row.progress.endsWith('%')
      ? Number.parseFloat(row.progress)
      : null;
    return <article className="library-card" key={row.id}>
      <a className="library-cover" href={`/item/${row.id}`} target="_blank" rel="noopener noreferrer" aria-label={`${language === 'ar' ? 'فتح' : 'Open'} ${row.title}`}>
        {row.cover_image ? <img src={row.cover_image} alt="" loading="lazy" /> :
          <span className="library-cover-placeholder" aria-hidden="true">{row.kind === 'book' ? '▤' : row.kind === 'movie' ? '▣' : row.kind === 'game' ? '◇' : '✎'}</span>}
        <span className="library-kind">{kindLabels[row.kind] || row.kind}</span>
      </a>
      <div className="library-card-body">
        <div className="library-card-title">
          <a href={`/item/${row.id}`} target="_blank" rel="noopener noreferrer"><h3>{row.title}</h3></a>
          <span className={`library-status status-${row.status || 'planned'}`}>{statusLabels[row.status] || row.status}</span>
        </div>
        {row.creator && <p className="library-creator">{row.creator}</p>}
        {row.review && <p className="library-review-preview">{row.review}</p>}
        <div className="library-card-meta">
          {row.rating && <span className="library-rating" aria-label={`${language === 'ar' ? 'التقييم' : 'Rating'} ${row.rating} / 5`}>★ {row.rating}/5</span>}
          {row.progress && <span>{row.progress}</span>}
          {row.tags && <span>{displayValue(row.tags)}</span>}
        </div>
        {percent !== null && <div className="library-progress" aria-label={`${percent}%`}><span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>}
        <div className="record-actions"><a className="button button-quiet" href={`/item/${row.id}`} target="_blank" rel="noopener noreferrer">{language === 'ar' ? 'عرض التفاصيل' : 'View details'} <span aria-hidden="true">↗</span></a></div>
      </div>
    </article>;
  }

  function renderReadingItem(row) {
    const statuses = language === 'ar'
      ? { unread: 'لم يُقرأ', reading: 'قيد القراءة', read: 'مكتمل', archived: 'مؤرشف' }
      : { unread: 'Unread', reading: 'Reading', read: 'Read', archived: 'Archived' };
    return <article className="reading-card" key={row.id}>
      <div className="reading-card-heading">
        <span className="reading-mark" aria-hidden="true">↗</span>
        <div><h3>{row.title}</h3>{row.url && <a href={row.url} target="_blank" rel="noreferrer">{row.url}</a>}</div>
        <span className={`reading-status reading-${row.status || 'unread'}`}>{statuses[row.status] || row.status}</span>
      </div>
      {row.description && <p className="reading-description">{row.description}</p>}
      {row.excerpt && <blockquote className="reading-excerpt">{row.excerpt}</blockquote>}
      {row.review && <p className="reading-review">{row.review}</p>}
      <div className="record-actions">
        <ActionIcon action="edit" label={`${t.edit}: ${row.title}`} onClick={() => setEditing(row)} />
        <ActionIcon action="delete" label={`${t.delete}: ${row.title}`} onClick={() => remove(row)} />
      </div>
    </article>;
  }

  function renderApplication(row) {
    const statusLabels = {
      applied: ['تم التقديم', 'applied'], screening: ['فرز أولي', 'screening'],
      interviewing: ['مقابلات', 'interviewing'], offer: ['عرض وظيفي', 'offer'],
      rejected: ['مرفوض', 'rejected'], withdrawn: ['منسحب', 'withdrawn'],
    };
    const [status, className] = statusLabels[row.status] || [row.status || '', ''];
    return <article className="application-card" key={row.id}>
      <div className="application-card-top"><span className="company-monogram" aria-hidden="true">{(row.company || '?').slice(0, 1).toLocaleUpperCase()}</span>
        <span className={`application-status ${className}`}>{status}</span></div>
      <h3>{row.company}</h3><p className="application-role">{row.role}</p>
      {row.applied_on && <p className="application-date">{language === 'ar' ? 'تاريخ التقديم' : 'Applied'} · {row.applied_on}</p>}
      <div className="application-card-footer">
        <span>{language === 'ar' ? `${row.rounds?.length || 0} جولات مقابلة` : `${row.rounds?.length || 0} interview rounds`}</span>
        <button className="button button-primary" type="button" onClick={() => config.open(row)}>{language === 'ar' ? 'عرض الملف ←' : 'View details →'}</button>
      </div>
    </article>;
  }

  async function copySnippet(row) {
    try {
      await navigator.clipboard.writeText(row.code || '');
      setCopiedSnippetId(row.id);
      window.setTimeout(() => setCopiedSnippetId(current => current === row.id ? null : current), 1800);
    } catch {
      setError(language === 'ar' ? 'تعذر نسخ المقطع. تحقق من صلاحية الحافظة في المتصفح.' : 'Could not copy the snippet. Check clipboard access in your browser.');
    }
  }

  return (
    <section className="page-card workspace-section">
      <header className="page-heading">
        <div><h1>{config.title}</h1><p>{language === 'ar' ? `${config.viewType === 'reading' ? readingMeta.total : rows.length} عنصر` : `${config.viewType === 'reading' ? readingMeta.total : rows.length} items`}</p></div>
        {writeEndpoint && <button className="button button-primary" type="button" onClick={() => setEditing({})}>＋ {config.viewType === 'tasks' ? (language === 'ar' ? 'مهمة جديدة' : 'New task') : t.newItem}</button>}
      </header>
      {error && <div className="notice error" role="alert">{error}</div>}
      {taskSummary && <div className="task-overview">
        {[
          ['open', language === 'ar' ? 'مفتوحة' : 'Open'],
          ['today', language === 'ar' ? 'اليوم' : 'Today'],
          ['overdue', language === 'ar' ? 'متأخرة' : 'Overdue'],
          ['completed', language === 'ar' ? 'مكتملة' : 'Completed'],
        ].map(([key, label]) => <article className={`task-overview-card task-overview-${key}`} key={key}><strong>{taskSummary[key]}</strong><span>{label}</span></article>)}
      </div>}
        {applicationSummary && <div className="interview-metrics">
          {[
            ['total', language === 'ar' ? 'إجمالي الطلبات' : 'Total applications'],
            ['active', language === 'ar' ? 'قيد المتابعة' : 'In progress'],
            ['interviewing', language === 'ar' ? 'مقابلات' : 'Interviewing'],
            ['offers', language === 'ar' ? 'عروض' : 'Offers'],
          ].map(([key, label]) => <article className={`interview-metric interview-metric-${key}`} key={key}><strong>{applicationSummary[key]}</strong><span>{label}</span></article>)}
        </div>}
      {config.viewType === 'tasks' && <form className="task-quick-add" onSubmit={addQuickTask}>
        <span aria-hidden="true">＋</span><label className="sr-only" htmlFor="quick-task-title">{language === 'ar' ? 'مهمة سريعة' : 'Quick task'}</label>
        <input id="quick-task-title" dir="auto" value={quickTask} onChange={event => setQuickTask(event.target.value)} placeholder={language === 'ar' ? 'اكتب مهمة واضغط Enter…' : 'Add a task and press Enter…'} />
        <button className="button button-primary" type="submit" disabled={!quickTask.trim()}>{language === 'ar' ? 'إضافة' : 'Add'}</button>
      </form>}
      {editing !== null && (config.viewType === 'library' || config.viewType === 'snippets'
        ? <EditorDialog
            title={editing.title || (config.viewType === 'library' ? (language === 'ar' ? 'عنصر جديد' : 'New library item') : (language === 'ar' ? 'مقطع جديد' : 'New snippet'))}
            language={language}
            onClose={() => setEditing(null)}
          >
            <Editor fields={config.fields} value={editing} language={language} onSubmit={save} onCancel={() => setEditing(null)} onUnauthorized={onUnauthorized} quickCapture={config.viewType === 'library'} />
          </EditorDialog>
        : <Editor fields={config.fields} value={editing} language={language} onSubmit={save} onCancel={() => setEditing(null)} onUnauthorized={onUnauthorized} />)}
      {config.viewType === 'library' && <div className="library-toolbar">
        <div className="library-filter-group" role="group" aria-label={language === 'ar' ? 'تصفية حسب النوع' : 'Filter by type'}>
          {[['all', language === 'ar' ? 'الكل' : 'All'], ['book', language === 'ar' ? 'كتب' : 'Books'], ['movie', language === 'ar' ? 'أفلام' : 'Movies'], ['game', language === 'ar' ? 'ألعاب' : 'Games'], ['memo', language === 'ar' ? 'مذكرات' : 'Notes']].map(([kind, label]) =>
            <button key={kind} type="button" className={`task-filter ${libraryKind === kind ? 'active' : ''}`} onClick={() => setLibraryKind(kind)}>{label}</button>)}
        </div>
        <select aria-label={language === 'ar' ? 'الحالة' : 'Status'} value={libraryStatus} onChange={event => setLibraryStatus(event.target.value)}>
          <option value="all">{language === 'ar' ? 'كل الحالات' : 'All statuses'}</option>
          <option value="planned">{language === 'ar' ? 'مخطط له' : 'Planned'}</option>
          <option value="in_progress">{language === 'ar' ? 'قيد المتابعة' : 'In progress'}</option>
          <option value="completed">{language === 'ar' ? 'مكتمل' : 'Completed'}</option>
          <option value="paused">{language === 'ar' ? 'متوقف مؤقتاً' : 'Paused'}</option>
        </select>
        <div className="library-view-switch" role="group" aria-label={language === 'ar' ? 'طريقة عرض المكتبة' : 'Library view'}>
          <button type="button" className={libraryLayout === 'grid' ? 'active' : ''} aria-pressed={libraryLayout === 'grid'} onClick={() => chooseLibraryLayout('grid')}>
            <span aria-hidden="true">▦</span>{language === 'ar' ? 'شبكة' : 'Grid'}
          </button>
          <button type="button" className={libraryLayout === 'list' ? 'active' : ''} aria-pressed={libraryLayout === 'list'} onClick={() => chooseLibraryLayout('list')}>
            <span aria-hidden="true">☷</span>{language === 'ar' ? 'قائمة' : 'List'}
          </button>
        </div>
      </div>}
      {config.viewType === 'tasks' && <div className="task-filter-row" role="group" aria-label={language === 'ar' ? 'تصفية المهام' : 'Filter tasks'}>
        {[
          ['open', language === 'ar' ? 'المفتوحة' : 'Open'],
          ['today', language === 'ar' ? 'اليوم' : 'Today'],
          ['upcoming', language === 'ar' ? 'القادمة' : 'Upcoming'],
          ['overdue', language === 'ar' ? 'المتأخرة' : 'Overdue'],
          ['completed', language === 'ar' ? 'المكتملة' : 'Completed'],
          ['all', language === 'ar' ? 'الكل' : 'All'],
        ].map(([key, label]) => <button className={`task-filter ${taskFilter === key ? 'active' : ''}`} type="button" key={key} onClick={() => setTaskFilter(key)}>{label}</button>)}
        <span className="task-filter-count">{filteredRows.length} {language === 'ar' ? 'مهمة' : 'tasks'}</span>
      </div>}
      {config.viewType === 'applications' && <div className="interview-filter-row" role="group" aria-label={language === 'ar' ? 'تصفية طلبات التوظيف' : 'Filter applications'}>
        {[
          ['all', language === 'ar' ? 'الكل' : 'All'],
          ['applied', language === 'ar' ? 'تم التقديم' : 'Applied'],
          ['screening', language === 'ar' ? 'فرز أولي' : 'Screening'],
          ['interviewing', language === 'ar' ? 'مقابلات' : 'Interviewing'],
          ['offer', language === 'ar' ? 'عروض' : 'Offers'],
          ['rejected', language === 'ar' ? 'مرفوض' : 'Rejected'],
          ['withdrawn', language === 'ar' ? 'منسحب' : 'Withdrawn'],
        ].map(([key, label]) => <button className={`task-filter ${applicationStatus === key ? 'active' : ''}`} type="button" key={key}
          onClick={() => { setApplicationStatus(key); setApplicationPage(1); }}>{label}</button>)}
        <span className="task-filter-count">{filteredRows.length} {language === 'ar' ? 'طلب' : 'applications'}</span>
      </div>}
      {(rows.length > 4 || config.viewType === 'reading' || config.viewType === 'tasks' || config.viewType === 'habits' || config.viewType === 'routines' || config.viewType === 'applications') && <div className="page-tools"><input className="search-box" aria-label={t.search} placeholder={t.search} value={filter} onChange={event => { setFilter(event.target.value); if (config.viewType === 'applications') setApplicationPage(1); if (config.viewType === 'reading') setReadingPage(1); }} /></div>}
      {busy ? <p>{t.loading}</p> : !filteredRows.length ? <p className="notice">{t.empty}</p> : (
        <div className={`record-grid ${config.viewType === 'tasks' ? 'task-grid' : ''} ${config.viewType === 'routines' ? 'routine-grid' : ''} ${config.viewType === 'habits' ? 'habit-grid' : ''} ${config.viewType === 'library' ? `library-grid library-${libraryLayout}` : ''} ${config.viewType === 'reading' ? 'reading-grid' : ''}`}>
          {displayedRows.map(row => (
            config.viewType === 'tasks' ? renderTask(row) : config.viewType === 'routines' ? renderRoutine(row) :
            config.viewType === 'habits' ? renderHabit(row) :
            config.viewType === 'library' ? renderLibraryItem(row) : config.viewType === 'reading' ? renderReadingItem(row) :
            config.viewType === 'applications' ? renderApplication(row) :
            config.viewType === 'snippets' ? <article className="snippet-card" key={row.id}>
              <header className="snippet-heading"><div><h3>{row.title}</h3>{row.description && <p>{row.description}</p>}</div>
                {row.language && <span className="snippet-language">{row.language}</span>}</header>
              <pre className="snippet-code" dir="ltr"><code>{row.code}</code></pre>
              <footer className="snippet-actions">
                <button className="button button-quiet" type="button" onClick={() => copySnippet(row)}>{copiedSnippetId === row.id ? (language === 'ar' ? 'نُسخ ✓' : 'Copied ✓') : (language === 'ar' ? 'نسخ الكود' : 'Copy code')}</button>
                <ActionIcon action="edit" label={`${t.edit}: ${row.title}`} onClick={() => setEditing(row)} />
                <ActionIcon action="delete" label={`${t.delete}: ${row.title}`} onClick={() => remove(row)} />
              </footer>
            </article> :
            <article className="record-card" key={row.id}>
              {config.linkKey === 'item' ? (
                <Link to={`/item/${row.id}`}><h3>{row.title}</h3></Link>
              ) : <h3>{row.title || row.name || row.company || row.description || `${config.singular} ${row.id}`}</h3>}
              {config.show?.map(key => row[key] !== undefined && row[key] !== null && row[key] !== '' && (
                <p key={key}><strong>{key.replaceAll('_', ' ')}: </strong>{displayValue(row[key])}</p>
              ))}
              {row.url && <a href={row.url} target="_blank" rel="noreferrer">{row.url}</a>}
              <div className="record-actions">
                {config.open && <button className="button button-primary" type="button" onClick={() => config.open(row)}>فتح</button>}
                {config.action && <button className="button button-quiet" type="button" onClick={() => runAction(row)}>{row[config.action.updateKey] ? (language === 'ar' ? 'تم اليوم ✓' : 'Done today ✓') : config.action.label}</button>}
                {config.fields && writeEndpoint && <ActionIcon action="edit" label={`${t.edit}: ${row.title || row.name || config.singular}`} onClick={() => setEditing(row)} />}
                {writeEndpoint && <ActionIcon action="delete" label={`${t.delete}: ${row.title || row.name || config.singular}`} onClick={() => remove(row)} />}
              </div>
            </article>
          ))}
        </div>
      )}
      {config.viewType === 'reading' && readingMeta.pageCount > 1 && <nav className="reading-pagination" aria-label={language === 'ar' ? 'صفحات المقالات' : 'Article pages'}>
        <button className="button button-quiet" type="button" disabled={readingMeta.page <= 1} onClick={() => setReadingPage(page => Math.max(1, page - 1))}>{language === 'ar' ? 'السابق' : 'Previous'}</button>
        <span>{language === 'ar' ? `صفحة ${readingMeta.page} من ${readingMeta.pageCount} · ${readingMeta.total} مقال` : `Page ${readingMeta.page} of ${readingMeta.pageCount} · ${readingMeta.total} articles`}</span>
        <button className="button button-quiet" type="button" disabled={readingMeta.page >= readingMeta.pageCount} onClick={() => setReadingPage(page => Math.min(readingMeta.pageCount, page + 1))}>{language === 'ar' ? 'التالي' : 'Next'}</button>
      </nav>}
      {config.viewType === 'applications' && filteredRows.length > 9 && <nav className="interview-pagination" aria-label={language === 'ar' ? 'صفحات طلبات التوظيف' : 'Application pages'}>
        <button className="button button-quiet" type="button" disabled={currentApplicationPage <= 1} onClick={() => setApplicationPage(page => Math.max(1, page - 1))}>{language === 'ar' ? 'السابق' : 'Previous'}</button>
        <span>{language === 'ar' ? `صفحة ${currentApplicationPage} من ${applicationPages}` : `Page ${currentApplicationPage} of ${applicationPages}`}</span>
        <button className="button button-quiet" type="button" disabled={currentApplicationPage >= applicationPages} onClick={() => setApplicationPage(page => Math.min(applicationPages, page + 1))}>{language === 'ar' ? 'التالي' : 'Next'}</button>
      </nav>}
      {query && <p className="notice">{query}</p>}
    </section>
  );
}
