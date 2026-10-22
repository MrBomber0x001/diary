import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { currentLocation, Link, navigate, useLocation } from './navigation.jsx';
import { messages } from './i18n.js';
import AuthScreen from './components/AuthScreen.jsx';
import AppShell from './components/AppShell.jsx';
import { FocusSessionProvider } from './components/FocusSessionContext.jsx';
import CollectionPage from './pages/CollectionPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import TodayPage from './pages/TodayPage.jsx';
import ItemDetailPage from './pages/ItemDetailPage.jsx';
import NotesPage from './pages/NotesPage.jsx';
import LearningPage from './pages/LearningPage.jsx';
import PlanningPage from './pages/PlanningPage.jsx';
import FinancePage from './pages/FinancePage.jsx';
import FocusPage from './pages/FocusPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import GalleryPage from './pages/GalleryPage.jsx';
import QuranPrayerPage from './pages/QuranPrayerPage.jsx';
import InterviewPage from './pages/InterviewPage.jsx';
import BookClubsPage from './pages/BookClubsPage.jsx';
import TimelinePage from './pages/TimelinePage.jsx';
import { collections } from './pages/collections.js';

function resolveRoute(location) {
  const url = new URL(location, window.location.origin);
  const item = url.pathname.match(/^\/item\/(\d+)\/?$/);
  if (item) return { page: 'item', id: item[1] };
  if (url.searchParams.has('clubInvite')) return { page: 'clubs' };
  return { page: url.searchParams.get('view') || 'today', date: url.searchParams.get('date') || '' };
}

export default function App() {
  const location = useLocation();
  const route = useMemo(() => resolveRoute(location), [location]);
  const [user, setUser] = useState(null);
  const [hasUsers, setHasUsers] = useState(true);
  const [checking, setChecking] = useState(true);
  const [language, setLanguage] = useState(() => localStorage.getItem('personal-memo-language') || 'ar');
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('personal-memo-theme') || 'system');
  const [themeError, setThemeError] = useState('');
  const [audioItem, setAudioItem] = useState(null);

  const unauthorized = useCallback(() => {
    setUser(null);
    if (currentLocation().startsWith('/item/')) navigate('/');
  }, []);
  const changeLanguage = value => {
    setLanguage(value);
    localStorage.setItem('personal-memo-language', value);
  };
  const changeTheme = value => {
    setThemeMode(value);
    localStorage.setItem('personal-memo-theme', value);
    setThemeError('');
  };

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api('/auth/status').then(result => result.hasUsers).catch(() => true),
      api('/auth/me').then(result => result.user).catch(() => null),
    ]).then(async ([exists, account]) => {
      if (!active) return;
      setHasUsers(exists);
      setUser(account);
      setChecking(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    api('/settings').then(preferences => {
      if (!active) return;
      if (preferences.language) changeLanguage(preferences.language);
      changeTheme(preferences.themeMode || 'system');
    }).catch(failure => {
      if (failure.status === 401) unauthorized();
      else setThemeError(failure.message);
    });
    return () => { active = false; };
  }, [user?.id]);

  async function toggleTheme() {
    const nextMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeError('');
    try {
      const preferences = await api('/settings');
      const result = await api('/settings', { method: 'PUT', body: { ...preferences, themeMode: nextMode } });
      changeTheme(result.themeMode || nextMode);
    } catch (failure) {
      if (failure.status === 401) unauthorized();
      else setThemeError(failure.message);
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    navigate('/');
  }

  let content;
  if (route.page === 'item') content = <ItemDetailPage id={route.id} language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'today') content = <TodayPage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'library') content = <CollectionPage config={collections.library} language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'tasks') content = <CollectionPage config={collections.tasks} language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'calendar') content = <CalendarPage initialDate={route.date} language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'timeline') content = <TimelinePage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'habits') content = <><CollectionPage config={collections.habits} language={language} onUnauthorized={unauthorized} /><CollectionPage config={collections.routines} language={language} onUnauthorized={unauthorized} /></>;
  else if (route.page === 'planning') content = <PlanningPage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'notes') content = <NotesPage section="articles" language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'bookmarks') content = <NotesPage section="bookmarks" language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'snippets') content = <NotesPage section="snippets" language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'daily-note') content = <NotesPage section="daily" date={route.date} language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'learning') content = <LearningPage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'finance') content = <FinancePage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'clubs') content = <BookClubsPage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'interviews') content = <InterviewPage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'gallery') content = <GalleryPage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'focus') content = <FocusPage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'quran') content = <QuranPrayerPage language={language} activeAudio={audioItem} onPlayAudio={setAudioItem} onUnauthorized={unauthorized} />;
  else if (route.page === 'settings') content = <SettingsPage language={language} onLanguageChange={changeLanguage} onThemeChange={changeTheme} onUnauthorized={unauthorized} />;
  else content = <section className="page-card"><h1>{messages[language].app}</h1><p>الصفحة غير موجودة.</p></section>;

  if (checking) return <main className="auth-screen"><p>{messages[language].loading}</p></main>;
  if (!user) return <div lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}><AuthScreen hasUsers={hasUsers} language={language} setLanguage={changeLanguage} onAuthenticated={setUser} /></div>;
  return <div lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
    <FocusSessionProvider userId={user.id} onUnauthorized={unauthorized}>
      <AppShell user={user} page={route.page} language={language} themeMode={themeMode} themeError={themeError} audioItem={audioItem}
        onAudioStop={() => setAudioItem(null)} onThemeToggle={toggleTheme} setLanguage={changeLanguage} onLogout={logout} onUnauthorized={unauthorized}>
        {content}
        {['notes', 'bookmarks', 'snippets', 'daily-note'].includes(route.page) && <section className="page-card">
          <div className="record-actions">
            <Link className="button button-quiet" to="/?view=notes">المقالات</Link>
            <Link className="button button-quiet" to="/?view=bookmarks">الروابط المحفوظة</Link>
            <Link className="button button-quiet" to="/?view=daily-note">المذكرة اليومية</Link>
            <Link className="button button-quiet" to="/?view=snippets">المقاطع البرمجية</Link>
          </div>
        </section>}
      </AppShell>
    </FocusSessionProvider>
  </div>;
}
