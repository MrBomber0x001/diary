import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, todayDate } from '../api.js';
import { messages } from '../i18n.js';
import Editor from '../components/Editor.jsx';
import ActionIcon from '../components/ActionIcon.jsx';
import { Link } from '../navigation.jsx';

const eventFields = [
  { key: 'title', label: 'عنوان الموعد', required: true },
  { key: 'description', label: 'الوصف', type: 'textarea', wide: true },
  { key: 'starts_at', label: 'يبدأ', type: 'datetime-local', required: true },
  { key: 'ends_at', label: 'ينتهي', type: 'datetime-local' },
  { key: 'all_day', label: 'طوال اليوم', type: 'checkbox' },
  {
    key: 'recurrence', label: 'التكرار', type: 'select',
    options: [
      { value: 'none', label: 'بدون تكرار' },
      { value: 'daily', label: 'يومياً' },
      { value: 'weekly', label: 'أسبوعياً' },
      { value: 'monthly', label: 'شهرياً' },
    ],
  },
];

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function monthGrid(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function dateLabel(value, language, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', options).format(new Date(`${value}T12:00:00`));
}

function localDateTime(value) {
  return `${value}T09:00`;
}

export default function CalendarPage({ language, onUnauthorized }) {
  const [month, setMonth] = useState(() => {
    const today = new Date(`${todayDate()}T12:00:00`);
    return new Date(today.getFullYear(), today.getMonth(), 1, 12);
  });
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = messages[language];
  const days = useMemo(() => monthGrid(month), [month]);
  const start = dateKey(days[0]);
  const end = dateKey(days[days.length - 1]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setEvents(await api(`/events?start=${start}&end=${end}`));
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, [start, end, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    for (const event of events) {
      const list = grouped.get(event.occurrence_date) || [];
      list.push(event);
      grouped.set(event.occurrence_date, list);
    }
    return grouped;
  }, [events]);
  const selectedEvents = eventsByDate.get(selectedDate) || [];

  function moveMonth(amount) {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1, 12);
    setMonth(next);
    const nextDay = dateKey(next);
    setSelectedDate(nextDay);
  }

  async function save(value) {
    const payload = {
      ...value,
      starts_at: value.starts_at?.slice(0, 16),
      ends_at: value.ends_at ? value.ends_at.slice(0, 16) : '',
      all_day: Boolean(value.all_day),
    };
    try {
      if (editing?.id) await api(`/events/${editing.id}`, { method: 'PUT', body: payload });
      else await api('/events', { method: 'POST', body: payload });
      setEditing(null);
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function remove(event) {
    if (!window.confirm(language === 'ar' ? 'حذف هذا الموعد وكل تكراراته؟' : 'Delete this event and its recurring occurrences?')) return;
    try {
      await api(`/events/${event.id}`, { method: 'DELETE' });
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  function newEvent() {
    setEditing({ starts_at: localDateTime(selectedDate), recurrence: 'none' });
  }

  const weekdayNames = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2024, 0, 1 + index, 12);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', { weekday: 'short' }).format(date);
  });
  const monthLabel = new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', { month: 'long', year: 'numeric' }).format(month);

  return <section className="page-card calendar-page">
    <header className="page-heading">
      <div><p className="eyebrow">{language === 'ar' ? 'خطّط لأيامك' : 'Plan your days'}</p><h1>{t.calendar}</h1><p>{language === 'ar' ? 'مواعيدك ومناسباتك في عرض شهري واضح.' : 'Your events and appointments, organized by month.'}</p></div>
      <button className="button button-primary" type="button" onClick={newEvent}>＋ {language === 'ar' ? 'موعد جديد' : 'New event'}</button>
    </header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {editing !== null && <Editor fields={eventFields} value={editing} language={language} onSubmit={save} onCancel={() => setEditing(null)} onUnauthorized={onUnauthorized} />}
    <div className="calendar-toolbar">
      <div className="calendar-month-nav">
        <button className="button button-quiet calendar-arrow" type="button" aria-label={language === 'ar' ? 'الشهر السابق' : 'Previous month'} onClick={() => moveMonth(-1)}>{language === 'ar' ? '›' : '‹'}</button>
        <h2 aria-live="polite">{monthLabel}</h2>
        <button className="button button-quiet calendar-arrow" type="button" aria-label={language === 'ar' ? 'الشهر التالي' : 'Next month'} onClick={() => moveMonth(1)}>{language === 'ar' ? '‹' : '›'}</button>
      </div>
      <button className="button button-quiet" type="button" onClick={() => { const date = new Date(`${todayDate()}T12:00:00`); setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12)); setSelectedDate(todayDate()); }}>
        {language === 'ar' ? 'اليوم' : 'Today'}
      </button>
    </div>
    <div className="calendar-grid" role="grid" aria-label={monthLabel}>
      {weekdayNames.map((name, index) => <div className="calendar-weekday" role="columnheader" key={index}>{name}</div>)}
      {days.map(date => {
        const key = dateKey(date);
        const dayEvents = eventsByDate.get(key) || [];
        const isCurrentMonth = date.getMonth() === month.getMonth();
        const isToday = key === todayDate();
        const isSelected = key === selectedDate;
        return <button
          className={`calendar-day ${isCurrentMonth ? '' : 'outside-month'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
          type="button" role="gridcell" aria-selected={isSelected}
          aria-label={`${dateLabel(key, language)}, ${dayEvents.length} ${language === 'ar' ? 'مواعيد' : 'events'}`}
          key={key} onClick={() => {
            setSelectedDate(key);
            if (!isCurrentMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
          }}
        >
          <span className="calendar-day-number">{new Intl.NumberFormat(language === 'ar' ? 'ar' : 'en').format(date.getDate())}</span>
          {dayEvents.length > 0 && <span className="calendar-day-events">
            {dayEvents.slice(0, 2).map(event => <span className="calendar-event-dot" key={`${event.id}-${event.occurrence_date}`}>{event.title}</span>)}
            {dayEvents.length > 2 && <span className="calendar-more">+{dayEvents.length - 2}</span>}
          </span>}
        </button>;
      })}
    </div>
    <section className="calendar-agenda" aria-live="polite">
      <header className="page-heading">
        <div><h2>{dateLabel(selectedDate, language)}</h2><p>{selectedEvents.length} {language === 'ar' ? 'مواعيد' : 'events'}</p></div>
        <button className="button button-quiet" type="button" onClick={newEvent}>＋ {language === 'ar' ? 'إضافة موعد' : 'Add event'}</button>
      </header>
      {busy ? <p>{t.loading}</p> : selectedEvents.length === 0
        ? <p className="notice">{language === 'ar' ? 'لا توجد مواعيد في هذا اليوم.' : 'Nothing scheduled for this day.'}</p>
        : <div className="agenda-list">{selectedEvents.map(event => <article className="agenda-event" key={`${event.id}-${event.occurrence_date}`}>
          <span className="agenda-time">{event.all_day ? (language === 'ar' ? 'طوال اليوم' : 'All day') : event.occurrence_start.slice(11, 16)}</span>
          <div className="agenda-event-copy">{event.interview_application_id
            ? <Link className="agenda-interview-link" to={`/?view=interviews&application=${event.interview_application_id}`}><h3>{event.title}</h3><span>{event.description}</span><small>{language === 'ar' ? 'فتح طلب التوظيف' : 'Open job application'} ↗</small></Link>
            : <><h3>{event.title}</h3>{event.description && <p>{event.description}</p>}</>}</div>
          <div className="record-actions">
            <ActionIcon action="edit" label={`${t.edit}: ${event.title}`} onClick={() => setEditing(event)} />
            <ActionIcon action="delete" label={`${t.delete}: ${event.title}`} onClick={() => remove(event)} />
          </div>
        </article>)}</div>}
    </section>
  </section>;
}
