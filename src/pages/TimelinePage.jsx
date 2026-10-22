import { useEffect, useMemo, useState } from 'react';
import { api, todayDate } from '../api.js';
import { Link } from '../navigation.jsx';

const typeKeys = ['notes', 'event', 'reading', 'viewing', 'task', 'habit', 'routine'];
const labels = {
  ar: {
    title: 'الخط الزمني',
    description: 'كل ما كتبته وأنجزته وتابعتَه، مرتباً حسب اليوم.',
    start: 'من',
    end: 'إلى',
    last7: '٧ أيام',
    last30: '٣٠ يوماً',
    last90: '٩٠ يوماً',
    all: 'الكل',
    notes: 'الملاحظات',
    event: 'المواعيد',
    reading: 'القراءة والكتب',
    viewing: 'الأفلام والألعاب',
    task: 'المهام',
    habit: 'العادات',
    routine: 'الروتين',
    empty: 'لا توجد أنشطة لهذه الفترة أو لهذه التصفية.',
    count: 'نشاط',
    writing: 'ملاحظة',
    thought: 'فكرة',
  },
  en: {
    title: 'Timeline',
    description: 'Your notes, activity, and milestones, organized by day.',
    start: 'From',
    end: 'To',
    last7: '7 days',
    last30: '30 days',
    last90: '90 days',
    all: 'All',
    notes: 'Notes',
    event: 'Events',
    reading: 'Reading & books',
    viewing: 'Movies & games',
    task: 'Tasks',
    habit: 'Habits',
    routine: 'Routines',
    empty: 'No activity matches this date range and filter.',
    count: 'activities',
    writing: 'Note',
    thought: 'Thought',
  },
};

function shiftDate(date, offset) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function includesFilter(entry, filters) {
  if (filters.includes('all')) return true;
  if (filters.includes('notes') && ['writing', 'thought'].includes(entry.type)) return true;
  return filters.includes(entry.type);
}

export default function TimelinePage({ language, onUnauthorized }) {
  const t = labels[language] || labels.en;
  const today = todayDate();
  const [start, setStart] = useState(() => shiftDate(today, -29));
  const [end, setEnd] = useState(today);
  const [selectedFilters, setSelectedFilters] = useState(['all']);
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    api(`/timeline?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`).then(result => {
      if (active) setEntries(result.entries);
    }).catch(failure => {
      if (!active) return;
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [end, onUnauthorized, start]);

  const filteredEntries = useMemo(
    () => entries.filter(entry => includesFilter(entry, selectedFilters)),
    [entries, selectedFilters],
  );
  const dayGroups = useMemo(() => {
    const groups = new Map();
    for (const entry of filteredEntries) {
      if (!groups.has(entry.date)) groups.set(entry.date, []);
      groups.get(entry.date).push(entry);
    }
    return [...groups.entries()];
  }, [filteredEntries]);

  function toggleFilter(key) {
    if (key === 'all') {
      setSelectedFilters(['all']);
      return;
    }
    setSelectedFilters(current => {
      const next = current.includes(key) ? current.filter(value => value !== key && value !== 'all') : [...current.filter(value => value !== 'all'), key];
      return next.length ? next : ['all'];
    });
  }

  function setRange(days) {
    setStart(shiftDate(today, -days + 1));
    setEnd(today);
  }

  function entryTypeLabel(type) {
    return t[type] || type;
  }

  return <section className="page-card timeline-page">
    <header className="page-heading">
      <div><h1>{t.title}</h1><p>{t.description}</p></div>
      <strong className="timeline-total">{filteredEntries.length} {t.count}</strong>
    </header>
    <div className="timeline-controls">
      <label>{t.start}<input type="date" value={start} max={end} onChange={event => setStart(event.target.value)} /></label>
      <label>{t.end}<input type="date" value={end} min={start} max={today} onChange={event => setEnd(event.target.value)} /></label>
      <div className="timeline-range-presets" role="group" aria-label={language === 'ar' ? 'الفترة الزمنية' : 'Date range'}>
        {[7, 30, 90].map(days => <button className="button button-quiet" type="button" key={days} onClick={() => setRange(days)}>
          {days === 7 ? t.last7 : days === 30 ? t.last30 : t.last90}
        </button>)}
      </div>
    </div>
    <div className="timeline-filters" role="group" aria-label={language === 'ar' ? 'تصفية الأنشطة' : 'Filter activity'}>
      {['all', ...typeKeys].map(key => {
        const active = selectedFilters.includes('all') ? key === 'all' : selectedFilters.includes(key);
        return <button type="button" className={`task-filter ${active ? 'active' : ''}`} key={key}
          aria-pressed={active} onClick={() => toggleFilter(key)}>{t[key]}</button>;
      })}
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {busy ? <p role="status">{language === 'ar' ? 'جارٍ تحميل الخط الزمني…' : 'Loading timeline…'}</p>
      : dayGroups.length === 0 ? <p className="notice">{t.empty}</p>
        : <div className="timeline-days">{dayGroups.map(([date, dayEntries]) => <section className="timeline-day" key={date}>
          <header className="timeline-day-heading">
            <span className="timeline-day-dot" aria-hidden="true" />
            <h2>{new Date(`${date}T12:00:00`).toLocaleDateString(language === 'ar' ? 'ar' : 'en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h2>
            <span>{dayEntries.length}</span>
          </header>
          <div className="timeline-day-entries">{dayEntries.map((entry, index) => <article className={`timeline-entry timeline-entry-${entry.type}`} key={`${entry.type}-${entry.id}-${index}`}>
            <span className="timeline-entry-icon" aria-hidden="true">{entry.type === 'writing' ? '✎' : entry.type === 'thought' ? '✦' : entry.type === 'event' ? '◷' : entry.type === 'reading' ? '▤' : entry.type === 'viewing' ? '◇' : entry.type === 'task' ? '✓' : entry.type === 'habit' ? '↻' : '✧'}</span>
            <div className="timeline-entry-copy">
              <span className="timeline-entry-type">{entryTypeLabel(entry.type)}</span>
              <h3>{entry.href ? <Link to={entry.href}>{entry.title}</Link> : entry.title}</h3>
              {entry.detail && <p dir="auto">{entry.detail}</p>}
            </div>
          </article>)}</div>
        </section>)}</div>}
  </section>;
}
