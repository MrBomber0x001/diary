import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, todayDate } from '../api.js';
import { navigate } from '../navigation.jsx';

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-CA');
}

function loadReadIds(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(stored) ? stored.filter(value => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function NotificationsCenter({ user, language, onUnauthorized }) {
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState(() => loadReadIds(`personal-memo-read-${user.username}`));
  const [settings, setSettings] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const sentIds = useRef(new Set());
  const readStorageKey = `personal-memo-read-${user.username}`;
  const isArabic = language === 'ar';

  const load = useCallback(async () => {
    const today = todayDate();
    try {
      const [todayData, todos, events, subscriptions, clubNotifications, preferences] = await Promise.all([
        api('/today'),
        api('/todos'),
        api(`/events?start=${today}&end=${dateOffset(1)}`),
        api('/finance/reminders'),
        api('/book-club-notifications'),
        api('/settings'),
      ]);
      const now = new Date();
      const reminderMinutes = Number(preferences.reminderMinutes) || 15;
      const reminderLimit = now.getTime() + reminderMinutes * 60_000;
      const notifications = [];

      todos.filter(task => !task.completed && task.due_date).forEach(task => {
        const dueAt = new Date(`${task.due_date}T${task.due_time || '23:59'}`);
        const overdue = dueAt < now;
        const dueToday = task.due_date === today;
        const withinReminder = dueAt.getTime() <= reminderLimit;
        if (!overdue && !dueToday && !withinReminder) return;
        notifications.push({
          id: `task-${task.id}-${task.due_date}-${task.due_time || 'all-day'}`,
          kind: overdue ? 'urgent' : 'task',
          title: overdue ? (isArabic ? 'مهمة متأخرة' : 'Overdue task') : (isArabic ? 'موعد مهمة' : 'Task deadline'),
          detail: task.title,
          meta: `${task.due_date}${task.due_time ? ` · ${task.due_time}` : ''}`,
          href: '/?view=tasks',
          timestamp: dueAt.getTime(),
        });
      });

      events.filter(event => event.occurrence_start).forEach(event => {
        const startsAt = new Date(event.occurrence_start);
        if (startsAt < now) return;
        notifications.push({
          id: `event-${event.id}-${event.occurrence_start}`,
          kind: 'event',
          title: isArabic ? 'موعد قادم' : 'Upcoming event',
          detail: event.title,
          meta: startsAt.toLocaleString(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }),
          href: '/?view=calendar',
          timestamp: startsAt.getTime(),
        });
      });

      subscriptions.forEach(subscription => {
        const renewalDate = new Date(`${subscription.next_renewal_date}T00:00:00`);
        const daysUntil = Math.floor((renewalDate.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
        if (daysUntil > 3 || daysUntil < -3) return;
        notifications.push({
          id: `subscription-${subscription.id}-${subscription.next_renewal_date}`,
          kind: daysUntil < 0 ? 'urgent' : 'subscription',
          title: daysUntil < 0 ? (isArabic ? 'اشتراك متأخر' : 'Subscription overdue') : (isArabic ? 'تجديد اشتراك قريب' : 'Subscription renewal'),
          detail: subscription.name,
          meta: daysUntil < 0
            ? (isArabic ? `متأخر منذ ${Math.abs(daysUntil)} أيام` : `${Math.abs(daysUntil)} days overdue`)
            : daysUntil === 0 ? (isArabic ? 'مستحق اليوم' : 'Due today') : (isArabic ? `بعد ${daysUntil} أيام` : `In ${daysUntil} days`),
          href: '/?view=finance',
          timestamp: renewalDate.getTime(),
        });
      });

      clubNotifications.forEach(notification => notifications.push({
        id: `club-${notification.id}`,
        clubId: notification.id,
        kind: 'club',
        title: isArabic ? `رسالة جديدة في ${notification.club_name}` : `New message in ${notification.club_name}`,
        detail: `${notification.sender_username}: ${notification.content}`,
        meta: new Date(notification.created_at).toLocaleString(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }),
        href: '/?view=clubs',
        timestamp: new Date(notification.created_at).getTime(),
      }));

      if (todayData.habits.total > todayData.habits.completed) {
        const remaining = todayData.habits.total - todayData.habits.completed;
        notifications.push({
          id: `habits-${today}`,
          kind: 'habit',
          title: isArabic ? 'لم تكتمل كل عادات اليوم' : 'Habits still to do',
          detail: isArabic ? `تبقّى ${remaining} من العادات` : `${remaining} habits remaining`,
          meta: today,
          href: '/?view=habits',
          timestamp: now.getTime(),
        });
      }
      if (todayData.routines.total > todayData.routines.completed) {
        const remaining = todayData.routines.total - todayData.routines.completed;
        notifications.push({
          id: `routines-${today}`,
          kind: 'routine',
          title: isArabic ? 'روتين اليوم بانتظارك' : 'Routines still to do',
          detail: isArabic ? `تبقّى ${remaining} من الروتينات` : `${remaining} routines remaining`,
          meta: today,
          href: '/?view=habits',
          timestamp: now.getTime(),
        });
      }

      notifications.sort((a, b) => (a.kind === 'urgent' ? -1 : 0) - (b.kind === 'urgent' ? -1 : 0) || a.timestamp - b.timestamp);
      setItems(notifications.slice(0, 40));
      setSettings(preferences);
      setError('');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }, [isArabic, onUnauthorized]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    localStorage.setItem(readStorageKey, JSON.stringify([...readIds].slice(-300)));
  }, [readIds, readStorageKey]);

  useEffect(() => {
    if (!settings?.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    let alreadySent = new Set();
    try {
      alreadySent = new Set(JSON.parse(sessionStorage.getItem('personal-memo-notification-sent') || '[]'));
    } catch {
      sessionStorage.removeItem('personal-memo-notification-sent');
    }
    items.filter(item => !alreadySent.has(item.id) && !readIds.has(item.id)).forEach(item => {
      try {
        new Notification(item.title, { body: item.detail, tag: item.id });
        alreadySent.add(item.id);
      } catch (failure) {
        setError(failure.message);
      }
    });
    sessionStorage.setItem('personal-memo-notification-sent', JSON.stringify([...alreadySent].slice(-100)));
  }, [items, readIds, settings]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const unreadCount = useMemo(() => items.filter(item => !readIds.has(item.id)).length, [items, readIds]);

  async function markRead(item) {
    if (item.clubId) {
      try {
        await api(`/book-club-notifications/${item.clubId}/read`, { method: 'POST', body: {} });
      } catch (failure) {
        if (failure.status === 401) onUnauthorized();
        else { setError(failure.message); return; }
      }
    }
    setReadIds(current => new Set(current).add(item.id));
  }

  async function markAllRead() {
    const clubItems = items.filter(item => item.clubId && !readIds.has(item.id));
    if (clubItems.length) {
      try {
        await api('/book-club-notifications/read-all', { method: 'POST', body: {} });
      } catch (failure) {
        if (failure.status === 401) onUnauthorized();
        else { setError(failure.message); return; }
      }
    }
    setReadIds(current => new Set([...current, ...items.map(item => item.id)]));
  }

  async function openItem(item) {
    await markRead(item);
    setOpen(false);
    navigate(item.href);
  }

  return <div className="notification-center">
    <button className={`notification-trigger ${open ? 'active' : ''}`} type="button" aria-label={isArabic ? `الإشعارات، ${unreadCount} غير مقروء` : `Notifications, ${unreadCount} unread`}
      aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></span>
      {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <section className="notification-popover" role="dialog" aria-label={isArabic ? 'مركز الإشعارات' : 'Notification center'}>
      <header className="notification-header"><div><h2>{isArabic ? 'الإشعارات' : 'Notifications'}</h2><p>{isArabic ? `${unreadCount} غير مقروء` : `${unreadCount} unread`}</p></div>
        <div>{unreadCount > 0 && <button className="notification-mark-all" type="button" onClick={markAllRead}>{isArabic ? 'قراءة الكل' : 'Mark all read'}</button>}
          <button className="icon-button" type="button" aria-label={isArabic ? 'إغلاق الإشعارات' : 'Close notifications'} onClick={() => setOpen(false)}>×</button></div>
      </header>
      {error && <p className="notification-error" role="alert">{error}</p>}
      <div className="notification-list">
        {items.length ? items.map(item => <button className={`notification-item ${readIds.has(item.id) ? 'read' : 'unread'} ${item.kind}`} type="button" key={item.id} onClick={() => openItem(item)}>
          <span className="notification-icon" aria-hidden="true">{({ urgent: '!', task: '✓', event: '▦', subscription: '↻', club: '◉', habit: '✳', routine: '✦' })[item.kind]}</span>
          <span className="notification-copy"><strong>{item.title}</strong><span>{item.detail}</span><small>{item.meta}</small></span>
          {!readIds.has(item.id) && <i className="notification-unread-dot" aria-label={isArabic ? 'غير مقروء' : 'Unread'} />}
        </button>) : <p className="notification-empty">{isArabic ? 'لا توجد إشعارات حالياً. ستظهر هنا المهام والمواعيد والتجديدات القريبة.' : 'You’re all caught up. Upcoming tasks, events, and renewals will appear here.'}</p>}
      </div>
      <footer className="notification-footer"><span>{isArabic ? 'تتحدّث تلقائياً كل دقيقة' : 'Refreshes every minute'}</span><button type="button" onClick={load}>{isArabic ? 'تحديث' : 'Refresh'} ↻</button></footer>
    </section>}
  </div>;
}
