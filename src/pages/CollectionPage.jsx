import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Link } from '../navigation.jsx';
import { messages } from '../i18n.js';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';
import EditorDialog from '../components/EditorDialog.jsx';
import WritingDialog from '../components/WritingDialog.jsx';
import MarkdownContent from '../components/MarkdownContent.jsx';
import { todayDate } from '../api.js';
import { useAppDialog } from '../components/AppDialogProvider.jsx';

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? '✓' : '';
  if (Array.isArray(value)) return value.map(displayValue).join('، ');
  if (typeof value === 'object') return Object.values(value).map(displayValue).filter(Boolean).join(' · ');
  return String(value);
}

function bookmarkHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function memoryDateLabel(value, language) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
}

const quickDateTokens = [
  ['tomorrow', 'tomorrow'],
  ['today', 'today'],
  ['غداً', 'tomorrow'], ['غدا', 'tomorrow'], ['بكرة', 'tomorrow'], ['بكره', 'tomorrow'],
  ['اليوم', 'today'],
  ['sunday', 'weekday:0'], ['sun', 'weekday:0'], ['الأحد', 'weekday:0'], ['الاحد', 'weekday:0'],
  ['monday', 'weekday:1'], ['mon', 'weekday:1'], ['الاثنين', 'weekday:1'], ['الإثنين', 'weekday:1'],
  ['tuesday', 'weekday:2'], ['tue', 'weekday:2'], ['الثلاثاء', 'weekday:2'],
  ['wednesday', 'weekday:3'], ['wed', 'weekday:3'], ['الأربعاء', 'weekday:3'], ['الاربعاء', 'weekday:3'],
  ['thursday', 'weekday:4'], ['thu', 'weekday:4'], ['الخميس', 'weekday:4'],
  ['friday', 'weekday:5'], ['fri', 'weekday:5'], ['الجمعة', 'weekday:5'],
  ['saturday', 'weekday:6'], ['sat', 'weekday:6'], ['السبت', 'weekday:6'],
];

const TaskDetailDialog = lazy(() => import('../components/TaskDetailDialog.jsx'));

function parseQuickTask(value, fallbackPriority) {
  let title = value.trim();
  const priorityMatch = title.match(/(?:^|\s)p([1-4])(?=$|\s)/i);
  const priority = priorityMatch ? Number(priorityMatch[1]) : Number(fallbackPriority || 4);
  if (priorityMatch) title = title.replace(priorityMatch[0], ' ').trim();

  let dueDate = null;
  const isoDate = title.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=$|\s)/);
  if (isoDate) {
    const parsedDate = new Date(`${isoDate[1]}T00:00:00Z`);
    if (Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === isoDate[1]) {
      dueDate = isoDate[1];
      title = title.replace(isoDate[0], ' ').trim();
    }
  }

  if (!dueDate) {
    for (const [token, kind] of quickDateTokens) {
      const matcher = new RegExp(`(?:^|\\s)${token}(?=$|\\s)`, 'i');
      const match = title.match(matcher);
      if (!match) continue;
      const next = new Date();
      next.setHours(12, 0, 0, 0);
      if (kind === 'tomorrow') next.setDate(next.getDate() + 1);
      else if (kind.startsWith('weekday:')) {
        const targetDay = Number(kind.slice('weekday:'.length));
        next.setDate(next.getDate() + ((targetDay - next.getDay() + 7) % 7 || 7));
      }
      dueDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      title = title.replace(match[0], ' ').trim();
      break;
    }
  }

  return { title: title.replace(/\s+/g, ' '), dueDate, priority };
}

export default function CollectionPage({ config, language, onUnauthorized, query = '' }) {
  const { confirm } = useAppDialog();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('open');
  const [taskLayout, setTaskLayout] = useState(() => localStorage.getItem('personal-memo-task-layout') === 'board' ? 'board' : 'list');
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragOverTaskColumn, setDragOverTaskColumn] = useState('');
  const [libraryKind, setLibraryKind] = useState('all');
  const [libraryStatus, setLibraryStatus] = useState('all');
  const [libraryLayout, setLibraryLayout] = useState(() => localStorage.getItem('personal-memo-library-layout') === 'list' ? 'list' : 'grid');
  const [applicationStatus, setApplicationStatus] = useState('all');
  const [applicationPage, setApplicationPage] = useState(1);
  const [readingPage, setReadingPage] = useState(1);
  const [readingQuery, setReadingQuery] = useState('');
  const [readingMeta, setReadingMeta] = useState({ total: 0, page: 1, pageSize: 25, pageCount: 0 });
  const [bookmarkFolder, setBookmarkFolder] = useState('all');
  const [quickTask, setQuickTask] = useState('');
  const [quickPriority, setQuickPriority] = useState(4);
  const [quickProject, setQuickProject] = useState('');
  const [quickOptionsOpen, setQuickOptionsOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState(null);
  const [taskProjects, setTaskProjects] = useState([]);
  const [expandedRoutines, setExpandedRoutines] = useState({});
  const [copiedSnippetId, setCopiedSnippetId] = useState(null);
  const t = messages[language];
  const endpoint = typeof config.endpoint === 'function' ? config.endpoint() : config.endpoint;
  const writeEndpoint = config.writeEndpoint || (typeof config.endpoint === 'string' ? config.endpoint : null);
  const editorFields = useMemo(() => config.viewType === 'tasks'
    ? config.fields.map(field => field.key === 'project_id'
      ? { ...field, options: [
        { value: '', label: language === 'ar' ? 'الوارد' : 'Inbox' },
        ...taskProjects.map(project => ({ value: project.id, label: project.title })),
      ] }
      : field)
    : config.fields, [config, language, taskProjects]);

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
      if (config.viewType === 'tasks') {
        const projects = await api('/projects');
        setTaskProjects(projects.filter(project => project.status === 'active'));
      }
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
      if (config.endpoint === '/bookmarks' && bookmarkFolder !== 'all' && (row.category || '').trim() !== bookmarkFolder) return false;
      return config.viewType === 'reading' || !term || JSON.stringify(row).toLocaleLowerCase().includes(term);
    });
  }, [applicationStatus, bookmarkFolder, config.endpoint, config.viewType, filter, libraryKind, libraryStatus, rows, taskFilter]);
  const bookmarkFolders = useMemo(() => [...new Set(rows.map(row => (row.category || '').trim()).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second, language)), [language, rows]);
  const taskDate = todayDate();
  const taskTime = new Date().toTimeString().slice(0, 5);
  const taskSummary = config.viewType === 'tasks' ? {
    open: rows.filter(row => !row.completed).length,
    today: rows.filter(row => !row.completed && row.due_date === taskDate).length,
    upcoming: rows.filter(row => !row.completed && row.due_date && row.due_date > taskDate).length,
    overdue: rows.filter(row => !row.completed && row.due_date && (row.due_date < taskDate
      || row.due_date === taskDate && row.due_time && row.due_time < taskTime)).length,
    completed: rows.filter(row => row.completed).length,
    all: rows.length,
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

  function chooseTaskLayout(layout) {
    setTaskLayout(layout);
    localStorage.setItem('personal-memo-task-layout', layout);
  }

  async function save(value) {
    const body = config.prepare ? config.prepare(value) : value;
    setError('');
    try {
      const result = editing?.id
        ? await api(`${writeEndpoint}/${editing.id}`, { method: 'PUT', body })
        : await api(writeEndpoint, { method: 'POST', body });
      if (editing?.id) setRows(current => {
        const updated = current.map(row => row.id === editing.id ? { ...row, ...result } : row);
        return config.viewType === 'memories'
          ? updated.sort((first, second) => second.memory_date.localeCompare(first.memory_date) || second.id - first.id)
          : updated;
      });
      else setRows(current => config.viewType === 'memories'
        ? [result, ...current].sort((first, second) => second.memory_date.localeCompare(first.memory_date) || second.id - first.id)
        : [result, ...current]);
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
    if (!await confirm({
      title: language === 'ar' ? 'حذف العنصر؟' : 'Delete item?',
      message: language === 'ar' ? `هل تريد حذف «${row.title || row.name || config.singular}»؟ لا يمكن التراجع عن هذا الإجراء.` : `Delete “${row.title || row.name || config.singular}”? This action can’t be undone.`,
      confirmLabel: language === 'ar' ? 'حذف' : 'Delete',
      danger: true,
    })) return;
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

  async function setTaskCompleted(row, completed) {
    if (Boolean(row.completed) === completed) return;
    try {
      const result = await api(`/todos/${row.id}`, {
        method: 'PUT',
        body: config.prepare({ ...row, completed }),
      });
      setRows(current => current.map(item => item.id === row.id ? { ...item, ...result } : item));
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function toggleTask(row) {
    await setTaskCompleted(row, !Boolean(row.completed));
  }

  const updateTaskSubtaskCounts = useCallback((taskId, count, completed) => {
    setRows(current => current.map(row => row.id === taskId
      ? { ...row, subtask_count: count, subtask_completed: completed }
      : row));
  }, []);

  async function addQuickTask(event) {
    event.preventDefault();
    const parsed = parseQuickTask(quickTask, quickPriority);
    const title = parsed.title;
    if (!title) return;
    try {
      await api(writeEndpoint, { method: 'POST', body: config.prepare({
        title,
        due_date: parsed.dueDate,
        priority: parsed.priority,
        project_id: quickProject || null,
      }) });
      setQuickTask('');
      setQuickPriority(4);
      setQuickProject('');
      await load();
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
    return <article className={`record-card task-card ${row.completed ? 'task-completed' : ''} ${draggingTaskId === row.id ? 'task-card-dragging' : ''}`}
      key={row.id} draggable={taskLayout === 'board'}
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(row.id));
        setDraggingTaskId(row.id);
      }}
      onDragEnd={() => { setDraggingTaskId(null); setDragOverTaskColumn(''); }}>
      <label className="task-check" aria-label={`${language === 'ar' ? 'تحديد اكتمال' : 'Mark complete'}: ${row.title}`}>
        <input type="checkbox" checked={Boolean(row.completed)} onChange={() => toggleTask(row)} />
        <span className="task-checkmark" aria-hidden="true">{row.completed ? '✓' : ''}</span>
      </label>
      <div className="task-card-content">
        <div className="task-card-title-row">
          <button className="task-card-open" type="button" onClick={() => setTaskDetail(row)}>{row.title}</button>
          {overdue && <span className="task-status overdue">{language === 'ar' ? 'متأخرة' : 'Overdue'}</span>}
          {row.completed && <span className="task-status completed">{language === 'ar' ? 'مكتملة' : 'Completed'}</span>}
        </div>
        {row.notes && <p className="task-notes" dir="auto">{row.notes}</p>}
        <div className="task-meta">
          {row.due_date && <span className={overdue ? 'task-due-overdue' : ''}>◷ {row.due_date}{row.due_time ? ` · ${row.due_time}` : ''}</span>}
          <span className={`task-priority task-priority-${row.priority || 4}`}>P{row.priority || 4}</span>
          {row.project_title && <span>▧ {row.project_title}</span>}
          {row.subtask_count > 0 && <button className="task-subtask-summary" type="button" onClick={() => setTaskDetail(row)} aria-label={language === 'ar' ? 'فتح الخطوات الفرعية' : 'Open subtasks'}>
            <span aria-hidden="true">☷</span>{row.subtask_completed || 0}/{row.subtask_count}
          </button>}
          {row.recurrence && row.recurrence !== 'none' && <span>↻ {({
            daily: language === 'ar' ? 'يومي' : 'Daily',
            weekly: language === 'ar' ? 'أسبوعي' : 'Weekly',
            monthly: language === 'ar' ? 'شهري' : 'Monthly',
            yearly: language === 'ar' ? 'سنوي' : 'Yearly',
          })[row.recurrence] || row.recurrence}</span>}
        </div>
      </div>
    </article>;
  }

  function renderTaskCollection() {
    if (busy) return <div className="task-loading-state">{t.loading}</div>;
    if (!filteredRows.length) return <div className="task-empty-state">
      <span aria-hidden="true">{filter ? '⌕' : taskFilter === 'completed' ? '✓' : '✦'}</span>
      <h2>{filter
        ? (language === 'ar' ? 'لا توجد مهام مطابقة' : 'No matching tasks')
        : taskFilter === 'today'
          ? (language === 'ar' ? 'يومك خالٍ من المهام' : 'Nothing planned for today')
          : taskFilter === 'completed'
            ? (language === 'ar' ? 'لا توجد مهام مكتملة بعد' : 'No completed tasks yet')
            : taskFilter === 'upcoming'
              ? (language === 'ar' ? 'لا توجد مهام قادمة' : 'No upcoming tasks')
              : taskFilter === 'overdue'
                ? (language === 'ar' ? 'لا توجد مهام متأخرة' : 'No overdue tasks')
                : taskFilter === 'all'
                  ? (language === 'ar' ? 'لم تضف أي مهام بعد' : 'No tasks yet')
                  : (language === 'ar' ? 'أنت على المسار الصحيح' : 'You’re all caught up')}</h2>
      <p>{filter
        ? (language === 'ar' ? 'جرّب كلمات بحث مختلفة.' : 'Try a different search.')
        : taskFilter === 'today'
          ? (language === 'ar' ? 'أضف مهمة سريعة أعلاه عندما تريد التخطيط ليومك.' : 'Add a quick task above whenever you want to plan your day.')
          : taskFilter === 'upcoming'
            ? (language === 'ar' ? 'المهام التي لها موعد لاحق ستظهر هنا.' : 'Tasks with a future due date will appear here.')
            : taskFilter === 'all'
              ? (language === 'ar' ? 'استخدم الإضافة السريعة لتسجيل أول مهمة.' : 'Use quick add above to capture your first task.')
              : (language === 'ar' ? 'ستظهر مهامك هنا عندما تضيفها.' : 'Your tasks will show up here when you add them.')}</p>
      {taskFilter === 'today' && <button className="button button-quiet" type="button" onClick={() => setTaskFilter('open')}>{language === 'ar' ? 'عرض كل المهام المفتوحة' : 'View all open tasks'}</button>}
    </div>;
    if (taskLayout === 'board') return <div className="task-board" aria-label={language === 'ar' ? 'لوحة المهام' : 'Task board'}>
      {[
        { key: 'open', completed: false, label: language === 'ar' ? 'مفتوحة' : 'To do', icon: '○' },
        { key: 'completed', completed: true, label: language === 'ar' ? 'مكتملة' : 'Completed', icon: '✓' },
      ].map(column => {
        const columnRows = filteredRows.filter(row => Boolean(row.completed) === column.completed);
        return <section key={column.key} className={`task-board-column ${dragOverTaskColumn === column.key ? 'task-board-column-over' : ''}`}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverTaskColumn(column.key); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOverTaskColumn(''); }}
          onDrop={event => {
            event.preventDefault();
            const row = rows.find(item => String(item.id) === event.dataTransfer.getData('text/plain'));
            setDragOverTaskColumn('');
            setDraggingTaskId(null);
            if (row) setTaskCompleted(row, column.completed);
          }}>
          <header><span aria-hidden="true">{column.icon}</span><h2>{column.label}</h2><b>{columnRows.length}</b></header>
          <div className="task-board-cards">{columnRows.length
            ? columnRows.map(row => renderTask(row))
            : <p className="task-board-empty">{language === 'ar' ? 'أفلت المهمة هنا أو أضف مهمة جديدة.' : 'Drop a task here or add a new one.'}</p>}</div>
        </section>;
      })}
    </div>;
    return <div className="record-grid task-grid">{filteredRows.map(renderTask)}</div>;
  }

  function renderTaskWorkspace() {
    const filterLabels = [
      ['open', language === 'ar' ? 'الوارد' : 'Inbox', '▤'],
      ['today', language === 'ar' ? 'اليوم' : 'Today', '◷'],
      ['upcoming', language === 'ar' ? 'القادمة' : 'Upcoming', '↗'],
      ['overdue', language === 'ar' ? 'المتأخرة' : 'Overdue', '!'],
      ['completed', language === 'ar' ? 'المكتملة' : 'Completed', '✓'],
      ['all', language === 'ar' ? 'كل المهام' : 'All tasks', '☷'],
    ];
    const currentLabel = filterLabels.find(([key]) => key === taskFilter)?.[1];
    return <div className="task-workspace">
      <aside className="task-sidebar">
        <div className="task-sidebar-heading">
          <span className="task-sidebar-icon" aria-hidden="true">✓</span>
          <div><span>{language === 'ar' ? 'مساحة العمل' : 'WORKSPACE'}</span><h2>{language === 'ar' ? 'المهام' : 'My tasks'}</h2></div>
        </div>
        <span className="task-sidebar-section-label">{language === 'ar' ? 'المشاهد' : 'VIEWS'}</span>
        <nav className="task-view-nav" aria-label={language === 'ar' ? 'مشاهد المهام' : 'Task views'}>
          {filterLabels.map(([key, label, icon]) => <button type="button" key={key} className={taskFilter === key ? 'active' : ''}
            aria-current={taskFilter === key ? 'page' : undefined} onClick={() => setTaskFilter(key)}>
            <span className="task-view-icon" aria-hidden="true">{icon}</span><span>{label}</span><b>{taskSummary[key]}</b>
          </button>)}
        </nav>
        <div className="task-sidebar-foot">
          <span>{language === 'ar' ? 'طريقة العرض' : 'LAYOUT'}</span>
          <div className="task-layout-switch" role="group" aria-label={language === 'ar' ? 'طريقة عرض المهام' : 'Task view'}>
            <button type="button" className={taskLayout === 'list' ? 'active' : ''} aria-pressed={taskLayout === 'list'} onClick={() => chooseTaskLayout('list')}>
              <span aria-hidden="true">☷</span>{language === 'ar' ? 'قائمة' : 'List'}
            </button>
            <button type="button" className={taskLayout === 'board' ? 'active' : ''} aria-pressed={taskLayout === 'board'} onClick={() => chooseTaskLayout('board')}>
              <span aria-hidden="true">▤</span>{language === 'ar' ? 'لوحة' : 'Board'}
            </button>
          </div>
        </div>
      </aside>
      <div className="task-main">
        <header className="task-main-header">
          <div><span className="task-main-eyebrow">{language === 'ar' ? 'خطوة واحدة في كل مرة' : 'ONE THING AT A TIME'}</span>
            <h2>{currentLabel}</h2>
            <p>{taskFilter === 'today'
              ? new Date(`${taskDate}T12:00:00`).toLocaleDateString(language === 'ar' ? 'ar' : 'en', { weekday: 'long', month: 'long', day: 'numeric' })
              : language === 'ar' ? `${filteredRows.length} مهمة` : `${filteredRows.length} ${filteredRows.length === 1 ? 'task' : 'tasks'}`}</p>
          </div>
          <label className="task-search-wrap"><span aria-hidden="true">⌕</span>
            <input className="task-search" aria-label={t.search} placeholder={language === 'ar' ? 'ابحث في المهام' : 'Search tasks'} value={filter} onChange={event => setFilter(event.target.value)} />
            {filter && <button type="button" aria-label={language === 'ar' ? 'مسح البحث' : 'Clear search'} onClick={() => setFilter('')}>×</button>}
          </label>
        </header>
        {editing !== null && <Editor fields={editorFields} value={editing} language={language} onSubmit={save} onCancel={() => setEditing(null)} onUnauthorized={onUnauthorized} />}
        <form className="task-quick-add" onSubmit={addQuickTask}>
          <span className="task-capture-plus" aria-hidden="true">＋</span>
          <label className="sr-only" htmlFor="quick-task-title">{language === 'ar' ? 'مهمة سريعة' : 'Quick task'}</label>
          <input id="quick-task-title" dir="auto" value={quickTask} onChange={event => setQuickTask(event.target.value)}
            placeholder={language === 'ar' ? 'أضف مهمة… مثل: اتصل بالطبيب غداً p1' : 'Add a task… e.g. Call the doctor tomorrow p1'} />
          <button type="button" className="task-options-toggle" aria-expanded={quickOptionsOpen} onClick={() => setQuickOptionsOpen(open => !open)}>
            <span aria-hidden="true">⚙</span>{language === 'ar' ? 'خيارات' : 'Options'}
          </button>
          <button className="button button-primary task-capture-submit" type="submit" disabled={!parseQuickTask(quickTask, quickPriority).title}>
            {language === 'ar' ? 'إضافة مهمة' : 'Add task'}<span aria-hidden="true">↵</span>
          </button>
          {quickOptionsOpen && <div className="task-quick-options">
            <label>{language === 'ar' ? 'الأولوية' : 'Priority'}
              <select aria-label={language === 'ar' ? 'أولوية المهمة' : 'Task priority'} value={quickPriority} onChange={event => setQuickPriority(Number(event.target.value))}>
                {[1, 2, 3, 4].map(priority => <option value={priority} key={priority}>{language === 'ar' ? `P${priority} · ${['عاجلة', 'عالية', 'منخفضة', 'عادية'][priority - 1]}` : `P${priority} · ${['Urgent', 'High', 'Low', 'Normal'][priority - 1]}`}</option>)}
              </select>
            </label>
            <label>{language === 'ar' ? 'المشروع' : 'Project'}
              <select aria-label={language === 'ar' ? 'مشروع المهمة' : 'Task project'} value={quickProject} onChange={event => setQuickProject(event.target.value)}>
                <option value="">{language === 'ar' ? 'الوارد' : 'Inbox'}</option>
                {taskProjects.map(project => <option value={project.id} key={project.id}>{project.title}</option>)}
              </select>
            </label>
            <small>{language === 'ar' ? 'يمكنك كتابة اليوم أو غداً أو يوم الأسبوع و P1–P4 مباشرة في المهمة.' : 'Type today, tomorrow, a weekday, or P1–P4 directly in the task.'}</small>
          </div>}
        </form>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="task-list-heading">
          <div><span className="task-list-indicator" aria-hidden="true" /><h3>{currentLabel}</h3><span>{filteredRows.length}</span></div>
          {taskFilter === 'today' && taskSummary.overdue > 0 && <button type="button" className="task-overdue-nudge" onClick={() => setTaskFilter('overdue')}>
            <span aria-hidden="true">!</span>{taskSummary.overdue} {language === 'ar' ? 'مهام متأخرة' : 'overdue'}<span aria-hidden="true">→</span>
          </button>}
        </div>
        {renderTaskCollection()}
      </div>
    </div>;
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
          <button type="button" onClick={() => setEditing(row)} aria-label={`${language === 'ar' ? 'تحرير' : 'Write'}: ${row.title}`}><h3>{row.title}</h3></button>
          <span className={`library-status status-${row.status || 'planned'}`}>{statusLabels[row.status] || row.status}</span>
        </div>
        {row.creator && <p className="library-creator">{row.creator}</p>}
        {(row.notes || row.review) && <p className="library-review-preview">{row.notes || row.review}</p>}
        <div className="library-card-meta">
          {row.rating && <span className="library-rating" aria-label={`${language === 'ar' ? 'التقييم' : 'Rating'} ${row.rating} / 5`}>★ {row.rating}/5</span>}
          {row.progress && <span>{row.progress}</span>}
          {row.tags && <span>{displayValue(row.tags)}</span>}
        </div>
        {percent !== null && <div className="library-progress" aria-label={`${percent}%`}><span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>}
        <div className="record-actions">
          <button className="button button-primary" type="button" onClick={() => setEditing(row)}>{language === 'ar' ? 'اكتب ملاحظة' : 'Write note'} <span aria-hidden="true">↗</span></button>
          <a className="button button-quiet" href={`/item/${row.id}`} target="_blank" rel="noopener noreferrer">{language === 'ar' ? 'التفاصيل' : 'Details'}</a>
        </div>
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
        <div><button type="button" className="reading-title-button" onClick={() => setEditing(row)}>{row.title}</button>{row.url && <a href={row.url} target="_blank" rel="noreferrer">{row.url}</a>}</div>
        <span className={`reading-status reading-${row.status || 'unread'}`}>{statuses[row.status] || row.status}</span>
      </div>
      {row.description && <p className="reading-description">{row.description}</p>}
      {row.excerpt && <blockquote className="reading-excerpt">{row.excerpt}</blockquote>}
      {row.review && <p className="reading-review">{row.review}</p>}
      <div className="record-actions">
        <button className="button button-quiet" type="button" onClick={() => setEditing(row)}>{language === 'ar' ? 'اكتب ملاحظاتك' : 'Write notes'}</button>
        <ActionIcon action="delete" label={`${t.delete}: ${row.title}`} onClick={() => remove(row)} />
      </div>
    </article>;
  }

  function renderMemory(row) {
    return <article className="memory-card" key={row.id}>
      <div className="memory-date-rail"><span aria-hidden="true">✦</span><time dateTime={row.memory_date}>{memoryDateLabel(row.memory_date, language)}</time></div>
      <div className="memory-card-content">
        <header className="memory-card-heading">
          <button type="button" onClick={() => setEditing(row)}><h2>{row.title}</h2></button>
          <div className="memory-card-actions">
            <ActionIcon action="edit" label={`${t.edit}: ${row.title}`} onClick={() => setEditing(row)} />
            <ActionIcon action="delete" label={`${t.delete}: ${row.title}`} onClick={() => remove(row)} />
          </div>
        </header>
        {(row.place || row.people) && <div className="memory-card-details">
          {row.place && <span><span aria-hidden="true">⌖</span>{row.place}</span>}
          {row.people && <span><span aria-hidden="true">◉</span>{row.people}</span>}
        </div>}
        {row.body
          ? <MarkdownContent className="memory-card-story">{row.body}</MarkdownContent>
          : <p className="memory-card-empty">{language === 'ar' ? 'أضف تفاصيل هذه الذكرى أو صورها.' : 'Add the story or photos for this memory.'}</p>}
        {row.tags && <div className="memory-card-tags">{row.tags.split(',').map(tag => tag.trim()).filter(Boolean)
          .map((tag, index) => <span key={`${tag}-${index}`}>#{tag}</span>)}</div>}
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
    <section className={`page-card workspace-section ${config.viewType === 'tasks' ? 'tasks-page-card' : ''}`}>
      {config.viewType !== 'tasks' && <header className="page-heading">
        <div><h1>{config.title}</h1><p>{config.viewType === 'memories'
          ? language === 'ar' ? `${rows.length} ذكرى محفوظة · لحظاتك تستحق أن تبقى.` : `${rows.length} ${rows.length === 1 ? 'memory' : 'memories'} saved · Keep the moments that matter.`
          : language === 'ar' ? `${config.viewType === 'reading' ? readingMeta.total : rows.length} عنصر` : `${config.viewType === 'reading' ? readingMeta.total : rows.length} items`}</p></div>
        {writeEndpoint && <button className="button button-primary" type="button" onClick={() => setEditing(config.viewType === 'memories'
          ? { memory_date: todayDate() }
          : config.endpoint === '/bookmarks' && bookmarkFolder !== 'all' ? { category: bookmarkFolder } : {})}>＋ {config.viewType === 'memories' ? language === 'ar' ? 'أضف ذكرى' : 'Add a memory' : t.newItem}</button>}
      </header>}
      {error && config.viewType !== 'tasks' && <div className="notice error" role="alert">{error}</div>}
      {config.viewType === 'tasks' ? renderTaskWorkspace() : <>
        {applicationSummary && <div className="interview-metrics">
          {[
            ['total', language === 'ar' ? 'إجمالي الطلبات' : 'Total applications'],
            ['active', language === 'ar' ? 'قيد المتابعة' : 'In progress'],
            ['interviewing', language === 'ar' ? 'مقابلات' : 'Interviewing'],
            ['offers', language === 'ar' ? 'عروض' : 'Offers'],
          ].map(([key, label]) => <article className={`interview-metric interview-metric-${key}`} key={key}><strong>{applicationSummary[key]}</strong><span>{label}</span></article>)}
        </div>}
      {config.endpoint === '/bookmarks' && <div className="bookmark-folder-tools">
        <span className="bookmark-folder-label">{language === 'ar' ? 'المجلدات' : 'Folders'}</span>
        <div className="bookmark-folder-tabs" role="group" aria-label={language === 'ar' ? 'تصفية الروابط حسب المجلد' : 'Filter links by folder'}>
          {[['all', language === 'ar' ? 'كل الروابط' : 'All links'], ...bookmarkFolders.map(folder => [folder, folder])].map(([folder, label]) =>
            <button className={`bookmark-folder-tab ${bookmarkFolder === folder ? 'active' : ''}`} type="button" key={folder}
              aria-pressed={bookmarkFolder === folder} onClick={() => setBookmarkFolder(folder)}>
              <span aria-hidden="true">{folder === 'all' ? '▦' : '▰'}</span>{label}
            </button>)}
        </div>
        <span>{filteredRows.length} {language === 'ar' ? 'رابط' : 'links'}</span>
      </div>}
      {config.viewType === 'tasks' && <form className="task-quick-add" onSubmit={addQuickTask}>
        <span aria-hidden="true">＋</span><label className="sr-only" htmlFor="quick-task-title">{language === 'ar' ? 'مهمة سريعة' : 'Quick task'}</label>
        <div className="task-quick-add-main">
          <input id="quick-task-title" dir="auto" value={quickTask} onChange={event => setQuickTask(event.target.value)} placeholder={language === 'ar' ? 'اتصل بالطبيب غداً p1…' : 'Call the doctor tomorrow p1…'} />
          <small>{language === 'ar' ? 'التاريخ والأولوية تُفهم من النص: اليوم، غداً، الاثنين، p1–p4' : 'Understands today, tomorrow, weekdays, and p1–p4'}</small>
        </div>
        <select aria-label={language === 'ar' ? 'أولوية المهمة' : 'Task priority'} value={quickPriority} onChange={event => setQuickPriority(Number(event.target.value))}>
          {[1, 2, 3, 4].map(priority => <option value={priority} key={priority}>{language === 'ar' ? `P${priority} · ${['عاجلة', 'عالية', 'منخفضة', 'عادية'][priority - 1]}` : `P${priority} · ${['Urgent', 'High', 'Low', 'Normal'][priority - 1]}`}</option>)}
        </select>
        <select aria-label={language === 'ar' ? 'مشروع المهمة' : 'Task project'} value={quickProject} onChange={event => setQuickProject(event.target.value)}>
          <option value="">{language === 'ar' ? 'الوارد' : 'Inbox'}</option>
          {taskProjects.map(project => <option value={project.id} key={project.id}>{project.title}</option>)}
        </select>
        <button className="button button-primary" type="submit" disabled={!parseQuickTask(quickTask, quickPriority).title}>{language === 'ar' ? 'إضافة' : 'Add task'}</button>
      </form>}
      {editing !== null && config.viewType === 'snippets' && <EditorDialog
            title={editing.title || (config.viewType === 'library' ? (language === 'ar' ? 'عنصر جديد' : 'New library item') : (language === 'ar' ? 'مقطع جديد' : 'New snippet'))}
            language={language}
            onClose={() => setEditing(null)}
          >
            <Editor fields={config.fields} value={editing} language={language} onSubmit={save} onCancel={() => setEditing(null)} onUnauthorized={onUnauthorized} />
          </EditorDialog>}
      {editing !== null && config.viewType !== 'library' && config.viewType !== 'reading' && config.viewType !== 'snippets' && <Editor fields={editorFields} value={editing} language={language} onSubmit={save} onCancel={() => setEditing(null)} onUnauthorized={onUnauthorized} />}
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
      {config.viewType === 'tasks' && <div className="task-toolbar">
        <div className="task-filter-row" role="group" aria-label={language === 'ar' ? 'تصفية المهام' : 'Filter tasks'}>
          {[
            ['open', language === 'ar' ? 'المفتوحة' : 'Open'],
            ['today', language === 'ar' ? 'اليوم' : 'Today'],
            ['upcoming', language === 'ar' ? 'القادمة' : 'Upcoming'],
            ['overdue', language === 'ar' ? 'المتأخرة' : 'Overdue'],
            ['completed', language === 'ar' ? 'المكتملة' : 'Completed'],
            ['all', language === 'ar' ? 'الكل' : 'All'],
          ].map(([key, label]) => <button className={`task-filter ${taskFilter === key ? 'active' : ''}`} type="button" key={key} aria-pressed={taskFilter === key} onClick={() => setTaskFilter(key)}>
            {label}<span className="task-filter-badge">{taskSummary[key]}</span>
          </button>)}
        </div>
        <div className="task-toolbar-tools">
          <input className="search-box task-search" aria-label={t.search} placeholder={t.search} value={filter} onChange={event => setFilter(event.target.value)} />
          <div className="task-layout-switch" role="group" aria-label={language === 'ar' ? 'طريقة عرض المهام' : 'Task view'}>
            <button type="button" className={taskLayout === 'list' ? 'active' : ''} aria-pressed={taskLayout === 'list'} onClick={() => chooseTaskLayout('list')}>
              <span aria-hidden="true">☷</span>{language === 'ar' ? 'قائمة' : 'List'}
            </button>
            <button type="button" className={taskLayout === 'board' ? 'active' : ''} aria-pressed={taskLayout === 'board'} onClick={() => chooseTaskLayout('board')}>
              <span aria-hidden="true">▤</span>{language === 'ar' ? 'لوحة' : 'Board'}
            </button>
          </div>
        </div>
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
      {(rows.length > 4 || config.viewType === 'reading' || config.viewType === 'memories' || config.viewType === 'habits' || config.viewType === 'routines' || config.viewType === 'applications') && <div className="page-tools"><input className="search-box" aria-label={t.search} placeholder={t.search} value={filter} onChange={event => { setFilter(event.target.value); if (config.viewType === 'applications') setApplicationPage(1); if (config.viewType === 'reading') setReadingPage(1); }} /></div>}
      {busy ? <p>{t.loading}</p> : !filteredRows.length && config.viewType === 'tasks' ? <div className="task-empty-state">
        <span aria-hidden="true">{filter ? '⌕' : taskFilter === 'completed' ? '✓' : '✦'}</span>
        <h2>{filter
          ? (language === 'ar' ? 'لا توجد مهام مطابقة' : 'No matching tasks')
          : taskFilter === 'today'
            ? (language === 'ar' ? 'يومك خالٍ من المهام' : 'Nothing planned for today')
            : taskFilter === 'completed'
              ? (language === 'ar' ? 'لا توجد مهام مكتملة بعد' : 'No completed tasks yet')
              : taskFilter === 'upcoming'
                ? (language === 'ar' ? 'لا توجد مهام قادمة' : 'No upcoming tasks')
                : taskFilter === 'overdue'
                  ? (language === 'ar' ? 'لا توجد مهام متأخرة' : 'No overdue tasks')
                  : taskFilter === 'all'
                    ? (language === 'ar' ? 'لم تضف أي مهام بعد' : 'No tasks yet')
                    : (language === 'ar' ? 'أنت على المسار الصحيح' : 'You’re all caught up')}</h2>
        <p>{filter
          ? (language === 'ar' ? 'جرّب كلمات بحث مختلفة.' : 'Try a different search.')
          : taskFilter === 'today'
            ? (language === 'ar' ? 'أضف مهمة سريعة أعلاه عندما تريد التخطيط ليومك.' : 'Add a quick task above whenever you want to plan your day.')
            : taskFilter === 'upcoming'
              ? (language === 'ar' ? 'المهام التي لها موعد لاحق ستظهر هنا.' : 'Tasks with a future due date will appear here.')
              : taskFilter === 'all'
                ? (language === 'ar' ? 'استخدم الإضافة السريعة لتسجيل أول مهمة.' : 'Use quick add above to capture your first task.')
                : (language === 'ar' ? 'ستظهر مهامك هنا عندما تضيفها.' : 'Your tasks will show up here when you add them.')}</p>
      </div> : !filteredRows.length && config.viewType === 'memories' ? <div className="memory-empty-state">
        <span aria-hidden="true">✦</span>
        <h2>{filter ? (language === 'ar' ? 'لا توجد ذكريات مطابقة' : 'No matching memories') : (language === 'ar' ? 'ابدأ بحفظ لحظة جميلة' : 'Save a moment worth remembering')}</h2>
        <p>{filter ? (language === 'ar' ? 'جرّب كلمات بحث أخرى.' : 'Try another search.') : (language === 'ar' ? 'اكتب قصتك، أضف صوراً، وسجّل الأشخاص والمكان والتاريخ.' : 'Write the story, add photos, and note who was there and where it happened.')}</p>
        {!filter && <button className="button button-primary" type="button" onClick={() => setEditing({ memory_date: todayDate() })}>{language === 'ar' ? 'أضف أول ذكرى' : 'Add your first memory'}</button>}
      </div> : !filteredRows.length ? <p className="notice">{t.empty}</p> : config.viewType === 'tasks' && taskLayout === 'board' ? (
        <div className="task-board" aria-label={language === 'ar' ? 'لوحة المهام' : 'Task board'}>
          {[
            { key: 'open', completed: false, label: language === 'ar' ? 'مفتوحة' : 'To do', icon: '○' },
            { key: 'completed', completed: true, label: language === 'ar' ? 'مكتملة' : 'Completed', icon: '✓' },
          ].map(column => {
            const columnRows = filteredRows.filter(row => Boolean(row.completed) === column.completed);
            return <section key={column.key} className={`task-board-column ${dragOverTaskColumn === column.key ? 'task-board-column-over' : ''}`}
              onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverTaskColumn(column.key); }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOverTaskColumn(''); }}
              onDrop={event => {
                event.preventDefault();
                const row = rows.find(item => String(item.id) === event.dataTransfer.getData('text/plain'));
                setDragOverTaskColumn('');
                setDraggingTaskId(null);
                if (row) setTaskCompleted(row, column.completed);
              }}>
              <header><span aria-hidden="true">{column.icon}</span><h2>{column.label}</h2><b>{columnRows.length}</b></header>
              <div className="task-board-cards">{columnRows.length
                ? columnRows.map(row => renderTask(row))
                : <p className="task-board-empty">{language === 'ar' ? 'أفلت المهمة هنا أو أضف مهمة جديدة.' : 'Drop a task here or add a new one.'}</p>}</div>
            </section>;
          })}
        </div>
      ) : (
        <div className={`record-grid ${config.endpoint === '/bookmarks' ? 'bookmark-grid' : ''} ${config.viewType === 'tasks' ? 'task-grid' : ''} ${config.viewType === 'routines' ? 'routine-grid' : ''} ${config.viewType === 'habits' ? 'habit-grid' : ''} ${config.viewType === 'library' ? `library-grid library-${libraryLayout}` : ''} ${config.viewType === 'reading' ? 'reading-grid' : ''} ${config.viewType === 'memories' ? 'memories-timeline' : ''}`}>
          {displayedRows.map(row => (
            config.viewType === 'tasks' ? renderTask(row) : config.viewType === 'routines' ? renderRoutine(row) :
            config.viewType === 'habits' ? renderHabit(row) :
            config.viewType === 'library' ? renderLibraryItem(row) : config.viewType === 'reading' ? renderReadingItem(row) :
            config.viewType === 'memories' ? renderMemory(row) :
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
            <article className={`record-card ${config.endpoint === '/bookmarks' ? 'bookmark-card' : ''}`} key={row.id}>
              {config.linkKey === 'item' ? (
                <Link to={`/item/${row.id}`}><h3>{row.title}</h3></Link>
              ) : <h3>{row.title || row.name || row.company || row.description || `${config.singular} ${row.id}`}</h3>}
              {config.show?.map(key => row[key] !== undefined && row[key] !== null && row[key] !== '' && (
                config.endpoint === '/bookmarks' && key === 'url'
                  ? null
                  : key === 'category' && config.endpoint === '/bookmarks'
                  ? <p className="bookmark-card-folder" key={key}><span className="bookmark-folder-tag">▰ {row.category}</span></p>
                  : <p key={key}><strong>{key.replaceAll('_', ' ')}: </strong>{displayValue(row[key])}</p>
              ))}
              {row.url && <a className={config.endpoint === '/bookmarks' ? 'bookmark-card-link' : ''} href={row.url} target="_blank" rel="noreferrer">
                {config.endpoint === '/bookmarks' ? bookmarkHostname(row.url) : row.url}
              </a>}
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
      </>}
      {taskDetail && <Suspense fallback={<div className="task-detail-backdrop"><div className="task-detail-loading">{language === 'ar' ? 'جارٍ فتح المهمة…' : 'Opening task…'}</div></div>}>
        <TaskDetailDialog task={taskDetail} language={language}
          onClose={() => setTaskDetail(null)}
          onEdit={task => { setTaskDetail(null); setEditing(task); }}
          onDelete={task => { setTaskDetail(null); remove(task); }}
          onUnauthorized={onUnauthorized}
          onCountsChange={updateTaskSubtaskCounts} />
      </Suspense>}
      {editing !== null && ['library', 'reading', 'memories'].includes(config.viewType) && <WritingDialog
        title={editing.title || (language === 'ar'
          ? config.viewType === 'reading' ? 'ملاحظة قراءة جديدة' : config.viewType === 'memories' ? 'ذكرى جديدة' : 'عنصر جديد'
          : config.viewType === 'reading' ? 'New reading note' : config.viewType === 'memories' ? 'A new memory' : 'New library item')}
        fields={config.fields}
        value={editing}
        bodyKey={config.viewType === 'reading' ? 'review' : config.viewType === 'memories' ? 'body' : 'notes'}
        language={language}
        onSubmit={save}
        onCancel={() => setEditing(null)}
        onUnauthorized={onUnauthorized}
        error={error} />}
    </section>
  );
}
