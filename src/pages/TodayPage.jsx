import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Link } from '../navigation.jsx';
import { messages } from '../i18n.js';
import { useFocusSession } from '../components/FocusSessionContext.jsx';

export default function TodayPage({ language, onUnauthorized }) {
  const [today, setToday] = useState(null);
  const [focusStats, setFocusStats] = useState(null);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [wellness, setWellness] = useState(null);
  const [widgets, setWidgets] = useState(['summary', 'focus', 'progress', 'tasks', 'events', 'habits', 'wellness']);
  const [customizing, setCustomizing] = useState(false);
  const [widgetError, setWidgetError] = useState('');
  const [error, setError] = useState('');
  const [savingTask, setSavingTask] = useState(null);
  const [savingCheckin, setSavingCheckin] = useState('');
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [focusContext, setFocusContext] = useState('');
  const { session, seconds, busy: focusBusy, error: focusError, startSession, pauseSession, resumeSession, completeSession } = useFocusSession();
  const t = messages[language];
  const load = useCallback(async () => {
    try {
      const [summary, focus, week, todos, wellnessToday, preferences, habits, routines] = await Promise.all([
        api('/today'), api('/focus'), api('/weekly-review'), api('/todos'),
        api('/wellness'), api('/dashboard/preferences'), api('/habits'), api('/routines'),
      ]);
      setToday({
        ...summary,
        tasks: todos.filter(row => row.due_date === summary.date && !row.completed),
        habitItems: habits,
        routineItems: routines,
      });
      setFocusStats(focus);
      setWeeklyReview(week);
      setWellness(wellnessToday);
      setWidgets(preferences.widgets);
    }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { load(); }, [load]);

  async function toggleWidget(widget) {
    const next = widgets.includes(widget) ? widgets.filter(item => item !== widget) : [...widgets, widget];
    setWidgetError('');
    try {
      const result = await api('/dashboard/preferences', { method: 'PUT', body: { widgets: next } });
      setWidgets(result.widgets);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setWidgetError(failure.message);
    }
  }

  async function completeTask(task) {
    setSavingTask(task.id);
    setError('');
    try {
      await api(`/todos/${task.id}`, { method: 'PUT', body: { ...task, completed: true } });
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally { setSavingTask(null); }
  }

  async function toggleCheckin(kind, item) {
    const key = `${kind}-${item.id}`;
    setSavingCheckin(key);
    setError('');
    try {
      await api(`/${kind}/${item.id}/log`, {
        method: 'PUT',
        body: { completed: !item.completed_today },
      });
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setSavingCheckin('');
    }
  }

  if (error) return <p className="notice error" role="alert">{error}</p>;
  if (!today) return <section className="page-card">{t.loading}</section>;
  const completedSessions = Number(focusStats?.completed_sessions || 0);
  const totalXP = Number(focusStats?.total_xp || 0);
  const totalFocusMinutes = Number(focusStats?.focus_minutes || 0);
  const trophies = [
    { id: 'first-focus', icon: '🌱', title: language === 'ar' ? 'البداية' : 'First focus', detail: language === 'ar' ? 'أكمل أول جلسة تركيز' : 'Complete your first focus session', value: completedSessions, target: 1 },
    { id: 'steady-focus', icon: '🔥', title: language === 'ar' ? 'ثبات' : 'On a roll', detail: language === 'ar' ? 'أكمل ٥ جلسات تركيز' : 'Complete 5 focus sessions', value: completedSessions, target: 5 },
    { id: 'deep-work', icon: '⌛', title: language === 'ar' ? 'عمل عميق' : 'Deep work', detail: language === 'ar' ? 'اجمع ١٠ ساعات تركيز' : 'Reach 10 hours of focus', value: Math.floor(totalFocusMinutes / 60), target: 10 },
    { id: 'xp-collector', icon: '🏆', title: language === 'ar' ? 'جامع الخبرة' : 'XP collector', detail: language === 'ar' ? 'اجمع ٥٠٠ نقطة خبرة' : 'Earn 500 experience points', value: totalXP, target: 500 },
  ];
  const dateLabel = new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en', { dateStyle: 'full' }).format(new Date(`${today.date}T12:00:00`));
  const focusDurationSeconds = Number(session?.minutes || focusMinutes) * 60;
  const focusRemaining = Math.max(0, focusDurationSeconds - seconds);
  const focusTimeLabel = `${String(Math.floor(focusRemaining / 60)).padStart(2, '0')}:${String(focusRemaining % 60).padStart(2, '0')}`;
  return (
    <>
      <section className="welcome">
        <p className="eyebrow">{dateLabel}</p><h1>{t.welcome}</h1>
        <p className="welcome-copy">{language === 'ar' ? 'ابدأ بخطوة صغيرة، وسجّل ما يهمك.' : 'Start with one small step and keep track of what matters.'}</p>
        <div className="welcome-actions">
          <Link className="button button-primary" to="/?view=tasks">＋ {language === 'ar' ? 'أضف مهمة' : 'Add a task'}</Link>
          <Link className="button home-daily-note-button" to="/?view=daily-note">✎ {language === 'ar' ? 'المذكرة اليومية' : 'Daily note'}</Link>
          <button className="button welcome-customize-button" type="button" aria-expanded={customizing} onClick={() => setCustomizing(open => !open)}>
            ⚙ {language === 'ar' ? 'تخصيص لوحة اليوم' : 'Customize dashboard'}
          </button>
        </div>
      </section>
      {customizing && <section className="page-card dashboard-customizer">
        <h2>{language === 'ar' ? 'اختر البطاقات التي تظهر في لوحة اليوم' : 'Choose cards for your daily dashboard'}</h2>
        {widgetError && <p className="notice error" role="alert">{widgetError}</p>}
        <div className="dashboard-widget-options">
          {[
            ['summary', language === 'ar' ? 'ملخص اليوم' : 'Daily summary'],
            ['focus', language === 'ar' ? 'جلسة التركيز' : 'Focus session'],
            ['progress', language === 'ar' ? 'التقدم والإنجازات' : 'Progress & achievements'],
            ['tasks', language === 'ar' ? 'مهام اليوم' : 'Today’s tasks'],
            ['events', language === 'ar' ? 'مواعيد اليوم' : 'Today’s events'],
            ['habits', language === 'ar' ? 'العادات والروتين' : 'Habits & routines'],
            ['wellness', language === 'ar' ? 'الغذاء واللياقة' : 'Diet & gym'],
          ].map(([key, label]) => <label className="dashboard-widget-option" key={key}>
            <input type="checkbox" checked={widgets.includes(key)} onChange={() => toggleWidget(key)} />
            <span>{label}</span>
          </label>)}
        </div>
      </section>}
      {widgets.includes('focus') && <section className={`page-card home-focus-card ${session ? 'home-focus-active' : ''}`}>
        <header className="page-heading">
          <div><p className="eyebrow">{language === 'ar' ? 'ابدأ الآن' : 'START NOW'}</p><h2>{language === 'ar' ? 'جلسة تركيز' : 'Focus session'}</h2>
            <p>{session?.contextLabel || (language === 'ar' ? 'ابدأ جلسة مباشرة من هنا، وستبقى مستمرة أثناء تنقلك.' : 'Start here; your session keeps running as you move around the app.')}</p></div>
          {session && <strong className="home-focus-timer" role="timer">{focusTimeLabel}</strong>}
        </header>
        {focusError && <p className="notice error" role="alert">{focusError}</p>}
        {session ? <div className="home-focus-controls">
          <span className={`home-focus-state ${session.paused ? 'paused' : ''}`}>{session.paused ? (language === 'ar' ? 'متوقفة مؤقتاً' : 'Paused') : (language === 'ar' ? 'الجلسة جارية' : 'In session')}</span>
          {focusRemaining > 0
            ? <button className="button button-primary" type="button" disabled={focusBusy} onClick={session.paused ? resumeSession : pauseSession}>
              {session.paused ? (language === 'ar' ? 'استئناف' : 'Resume') : (language === 'ar' ? 'إيقاف مؤقت' : 'Pause')}
            </button>
            : <button className="button button-primary" type="button" disabled={focusBusy} onClick={async () => { if (await completeSession()) await load(); }}>
              {language === 'ar' ? 'إنهاء الجلسة وكسب XP' : 'Complete session & earn XP'}
            </button>}
          <Link className="button button-quiet" to="/?view=focus">{language === 'ar' ? 'خيارات التركيز' : 'Focus options'} →</Link>
        </div> : <div className="home-focus-controls">
          <input className="home-focus-intention" dir="auto" maxLength="160" value={focusContext} onChange={event => setFocusContext(event.target.value)}
            aria-label={language === 'ar' ? 'نية جلسة التركيز' : 'Focus intention'} placeholder={language === 'ar' ? 'ما الذي ستركز عليه؟ (اختياري)' : 'What will you focus on? (optional)'} />
          <div className="home-focus-presets" role="group" aria-label={language === 'ar' ? 'مدة جلسة التركيز' : 'Focus duration'}>
            {[15, 25, 45].map(minutes => <button key={minutes} type="button" className={focusMinutes === minutes ? 'active' : ''} aria-pressed={focusMinutes === minutes} onClick={() => setFocusMinutes(minutes)}>{minutes} {language === 'ar' ? 'د' : 'min'}</button>)}
          </div>
          <button className="button button-primary" type="button" disabled={focusBusy} onClick={() => startSession({ minutes: focusMinutes, contextLabel: focusContext })}>
            ▶ {language === 'ar' ? `ابدأ ${focusMinutes} دقيقة` : `Start ${focusMinutes} minutes`}
          </button>
        </div>}
      </section>}
      {widgets.includes('summary') && <section className="metric-grid">
        {[
          [language === 'ar' ? 'المهام المتبقية' : 'Tasks remaining', today.tasks.length],
          [language === 'ar' ? 'العادات المنجزة' : 'Habits completed', `${today.habits.completed}/${today.habits.total}`],
          [language === 'ar' ? 'الروتينات المنجزة' : 'Routines completed', `${today.routines.completed}/${today.routines.total}`],
          [language === 'ar' ? 'مواعيد اليوم' : 'Today’s events', today.events.length],
        ].map(([label, value]) => <article className="metric-card" key={label}><strong>{value}</strong><span>{label}</span></article>)}
      </section>}
      {widgets.includes('wellness') && wellness && <section className="page-card dashboard-wellness-card">
        <header className="page-heading">
          <div><p className="eyebrow">{language === 'ar' ? 'صحتك اليوم' : 'YOUR WELLBEING TODAY'}</p><h2>{language === 'ar' ? 'الغذاء واللياقة' : 'Diet & gym'}</h2>
            <p>{language === 'ar'
              ? `${wellness.summary.calories} سعرة · ${wellness.workouts.length} تمارين · ${wellness.water_total_ml} مل ماء`
              : `${wellness.summary.calories} kcal · ${wellness.workouts.length} exercises · ${wellness.water_total_ml} ml water`}</p>
          </div>
          <Link className="button button-quiet" to="/?view=wellness">{language === 'ar' ? 'سجّل وجبة أو تمرين' : 'Log a meal or workout'} →</Link>
        </header>
        <div className="dashboard-wellness-progress">
          {wellness.profile.calorie_goal && <Progress label={language === 'ar' ? 'السعرات' : 'Calories'} current={wellness.summary.calories} goal={wellness.profile.calorie_goal} unit="kcal" />}
          {wellness.profile.water_goal_ml && <Progress label={language === 'ar' ? 'الماء' : 'Water'} current={wellness.water_total_ml} goal={wellness.profile.water_goal_ml} unit="ml" />}
        </div>
      </section>}
      {widgets.includes('progress') && <section className="page-card gamification-card">
        <header className="page-heading">
          <div><p className="eyebrow">{language === 'ar' ? 'إنجازاتك' : 'Your progress'}</p><h2>{language === 'ar' ? 'نقاط الخبرة' : 'Experience points'}</h2></div>
          <Link className="button button-quiet" to="/?view=focus">{language === 'ar' ? 'جلسة تركيز' : 'Focus session'} →</Link>
        </header>
        <div className="gamification-stats">
          <article className="xp-feature"><span className="xp-icon" aria-hidden="true">✦</span><div><strong>{focusStats?.total_xp || 0} XP</strong><span>{language === 'ar' ? 'إجمالي نقاط الخبرة' : 'Lifetime experience'}</span></div></article>
          <article className="xp-stat"><strong>{focusStats?.week_xp || 0} XP</strong><span>{language === 'ar' ? 'هذا الأسبوع' : 'Earned this week'}</span></article>
          <article className="xp-stat"><strong>{focusStats?.completed_sessions || 0}</strong><span>{language === 'ar' ? 'جلسات مكتملة' : 'Sessions completed'}</span></article>
          <article className="xp-stat"><strong>{Math.floor((focusStats?.focus_minutes || 0) / 60)}h {(focusStats?.focus_minutes || 0) % 60}m</strong><span>{language === 'ar' ? 'وقت التركيز' : 'Focused time'}</span></article>
        </div>
        <div className="weekly-progress-row">
          <span>{language === 'ar' ? 'إنجازات هذا الأسبوع' : 'This week’s activity'}</span>
          <span>{weeklyReview?.tasks.completed || 0} {language === 'ar' ? 'مهام ·' : 'tasks ·'} {weeklyReview?.habits.completed || 0} {language === 'ar' ? 'عادات' : 'habit check-ins'}</span>
        </div>
        <p className="gamification-note">{language === 'ar' ? 'تكسب نقطة خبرة واحدة عن كل دقيقة تركيز مكتملة.' : 'Earn 1 experience point for every completed focus minute.'}</p>
      </section>}
      {widgets.includes('progress') && <section className="page-card trophy-shelf">
        <header className="page-heading"><div><p className="eyebrow">{language === 'ar' ? 'إنجازات صغيرة، أثر كبير' : 'Small wins, real momentum'}</p><h2>{language === 'ar' ? 'كؤوسك' : 'Your trophies'}</h2></div>
          <span className="trophy-count">{trophies.filter(trophy => trophy.value >= trophy.target).length} / {trophies.length} {language === 'ar' ? 'مفتوحة' : 'unlocked'}</span></header>
        <div className="trophy-grid">{trophies.map(trophy => {
          const unlocked = trophy.value >= trophy.target;
          const percent = Math.min(100, Math.round(trophy.value / trophy.target * 100));
          return <article className={`trophy-card ${unlocked ? 'unlocked' : ''}`} key={trophy.id}>
            <span className="trophy-icon" aria-hidden="true">{trophy.icon}</span>
            <div className="trophy-copy"><strong>{trophy.title}</strong><span>{trophy.detail}</span>
              <div className="trophy-progress"><span style={{ width: `${percent}%` }} /></div>
              <small>{Math.min(trophy.value, trophy.target)} / {trophy.target}</small>
            </div>
            <span className="trophy-state" aria-label={unlocked ? (language === 'ar' ? 'تم فتح الكأس' : 'Trophy unlocked') : (language === 'ar' ? 'مقفل' : 'Locked')}>{unlocked ? '✓' : '· · ·'}</span>
          </article>;
        })}</div>
      </section>}
      <div className="today-agenda-grid">
        {widgets.includes('tasks') && <section className="page-card today-agenda-card">
          <header className="page-heading"><div><p className="eyebrow">{language === 'ar' ? 'خطوتك التالية' : 'Your next steps'}</p><h2>{language === 'ar' ? 'مهام اليوم' : 'Today’s tasks'}</h2><p>{language === 'ar' ? `${today.tasks.length} مهام متبقية` : `${today.tasks.length} remaining`}</p></div>
            <Link className="button button-quiet" to="/?view=tasks">{language === 'ar' ? 'عرض الكل' : 'View all'} →</Link></header>
          {today.tasks.length ? <div className="today-task-list">{today.tasks.map(task => <article className="today-task-row" key={task.id}>
            <button className="today-task-complete" type="button" disabled={savingTask === task.id} aria-label={`${language === 'ar' ? 'إكمال' : 'Complete'}: ${task.title}`} onClick={() => completeTask(task)}>✓</button>
            <div className="today-task-copy"><strong dir="auto">{task.title}</strong><span>{task.due_time ? `◷ ${task.due_time}` : (language === 'ar' ? 'مجدولة لليوم' : 'Scheduled for today')}</span></div>
            <Link className="today-task-open" to="/?view=tasks" aria-label={language === 'ar' ? 'فتح المهام' : 'Open tasks'}>›</Link>
          </article>)}</div> : <div className="today-empty-state"><span aria-hidden="true">✓</span><p>{language === 'ar' ? 'يومك مفتوح — لا توجد مهام متبقية.' : 'You have room to breathe—no tasks left today.'}</p></div>}
        </section>}
        {widgets.includes('events') && <section className="page-card today-agenda-card">
          <header className="page-heading"><div><p className="eyebrow">{language === 'ar' ? 'على جدولك' : 'On your calendar'}</p><h2>{language === 'ar' ? 'مواعيد اليوم' : 'Today’s events'}</h2><p>{language === 'ar' ? `${today.events.length} مواعيد` : `${today.events.length} events`}</p></div>
            <Link className="button button-quiet" to="/?view=calendar">{language === 'ar' ? 'التقويم' : 'Calendar'} →</Link></header>
          {today.events.length ? <div className="today-event-list">{today.events.map(event => <article className="today-event-row" key={`${event.id}-${event.occurrence_start}`}>
            <span className="today-event-time">{event.all_day ? (language === 'ar' ? 'طوال اليوم' : 'All day') : (event.occurrence_start || '').slice(11, 16)}</span>
            <div>{event.interview_application_id
              ? <Link className="today-interview-link" to={`/?view=interviews&application=${event.interview_application_id}`}><strong dir="auto">{event.title}</strong><span>{language === 'ar' ? 'فتح طلب التوظيف' : 'Open job application'} ↗</span></Link>
              : <><strong dir="auto">{event.title}</strong>{event.description && <span dir="auto">{event.description}</span>}</>}</div>
          </article>)}</div> : <div className="today-empty-state"><span aria-hidden="true">◷</span><p>{language === 'ar' ? 'لا توجد مواعيد اليوم.' : 'No events scheduled today.'}</p></div>}
        </section>}
      </div>
      {widgets.includes('habits') && <section className="page-card dashboard-habits-card">
        <header className="page-heading"><div><p className="eyebrow">{language === 'ar' ? 'خطواتك اليومية' : 'DAILY CHECK-IN'}</p>
          <h2>{language === 'ar' ? 'العادات والروتين' : 'Habits & routines'}</h2></div>
          <Link className="button button-quiet" to="/?view=habits">{language === 'ar' ? 'إدارة العادات' : 'Manage habits'} →</Link>
        </header>
        <div className="dashboard-habits-content">
          <div className="dashboard-habit-summary">
            <article><span>{language === 'ar' ? 'العادات' : 'Habits'}</span><strong>{today.habits.completed}/{today.habits.total}</strong></article>
            <article><span>{language === 'ar' ? 'الروتينات' : 'Routines'}</span><strong>{today.routines.completed}/{today.routines.total}</strong></article>
          </div>
          {today.habitItems.length + today.routineItems.length > 0
            ? <div className="dashboard-checkin-list">
              {[...today.habitItems.map(item => ({ ...item, kind: 'habits' })), ...today.routineItems.map(item => ({ ...item, kind: 'routines' }))].map(item => {
                const key = `${item.kind}-${item.id}`;
                return <label className={`dashboard-checkin ${item.completed_today ? 'completed' : ''}`} key={key}>
                  <input type="checkbox" checked={Boolean(item.completed_today)} disabled={savingCheckin === key}
                    onChange={() => toggleCheckin(item.kind, item)} />
                  <span dir="auto">{item.title}</span>
                </label>;
              })}
            </div>
            : <p className="dashboard-checkin-empty">{language === 'ar' ? 'أضف عادات أو روتيناً لتظهر هنا.' : 'Add habits or routines to see them here.'}</p>}
        </div>
      </section>}
    </>
  );
}

function Progress({ label, current, goal, unit }) {
  const percent = Math.min(100, Math.round(Number(current || 0) / goal * 100));
  return <div className="dashboard-wellness-goal">
    <div><span>{label}</span><strong>{current} / {goal} {unit}</strong></div>
    <div className="dashboard-goal-track"><span style={{ width: `${percent}%` }} /></div>
  </div>;
}
