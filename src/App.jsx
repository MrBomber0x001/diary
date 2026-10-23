import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { currentLocation, Link, navigate, useLocation } from './navigation.jsx';
import { messages } from './i18n.js';
import AuthScreen from './components/AuthScreen.jsx';
import AppShell from './components/AppShell.jsx';
import { AppDialogProvider } from './components/AppDialogProvider.jsx';
import { FocusSessionProvider } from './components/FocusSessionContext.jsx';
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
import WellnessPage from './pages/WellnessPage.jsx';
import { collections } from './pages/collections.js';

const CollectionPage = lazy(() => import('./pages/CollectionPage.jsx'));

function resolveRoute(location) {
  const url = new URL(location, window.location.origin);
  const item = url.pathname.match(/^\/item\/(\d+)\/?$/);
  if (item) return { page: 'item', id: item[1] };
  if (url.searchParams.has('clubInvite')) return { page: 'clubs' };
  return { page: url.searchParams.get('view') || 'today', date: url.searchParams.get('date') || '' };
}

function readExtensionCapture() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const token = hash.get('capture');
  if (!token) return null;
  if (token.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('The extension capture link is invalid.');
  }
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const capture = JSON.parse(new TextDecoder().decode(bytes));
  const title = typeof capture.title === 'string' ? capture.title.trim() : '';
  const url = typeof capture.url === 'string' ? capture.url.trim() : '';
  const parsedUrl = new URL(url);
  if (!title || title.length > 300 || url.length > 2048
    || !['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error('The extension did not provide a valid page title and URL.');
  }
  return {
    token,
    article: {
      title,
      url,
      description: typeof capture.description === 'string' ? capture.description.slice(0, 2000) : '',
      excerpt: (typeof capture.excerpt === 'string' && capture.excerpt.trim()
        ? capture.excerpt
        : typeof capture.readableText === 'string' ? capture.readableText : '').slice(0, 5000),
      review: '',
      status: 'unread',
    },
  };
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
  const [extensionCapture, setExtensionCapture] = useState(null);
  const captureInFlight = useRef('');

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

  const saveExtensionCapture = useCallback(async retry => {
    let capture;
    try {
      capture = readExtensionCapture();
      if (!capture) {
        setExtensionCapture(null);
        return;
      }
    } catch (failure) {
      setExtensionCapture({ type: 'error', message: failure.message });
      return;
    }
    if (!user || captureInFlight.current === capture.token) return;
    captureInFlight.current = capture.token;
    setExtensionCapture({ type: 'saving', title: capture.article.title, token: capture.token });
    try {
      await api('/articles', { method: 'POST', body: capture.article });
      if (window.location.hash.includes(capture.token)) {
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      }
      setExtensionCapture({
        type: 'success',
        message: language === 'ar' ? 'تم حفظ الرابط في قائمة القراءة.' : 'Page saved to your reading list.',
      });
      captureInFlight.current = '';
    } catch (failure) {
      captureInFlight.current = '';
      if (failure.status === 401) unauthorized();
      setExtensionCapture({
        type: 'error',
        message: failure.message,
        token: capture.token,
        retry,
      });
    }
  }, [language, unauthorized, user]);

  useEffect(() => {
    if (user) saveExtensionCapture(false);
  }, [user?.id, saveExtensionCapture]);

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
  else if (route.page === 'memories') content = <NotesPage section="memories" language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'bookmarks') content = <NotesPage section="bookmarks" language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'snippets') content = <NotesPage section="snippets" language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'daily-note') content = <NotesPage section="daily" date={route.date} language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'learning') content = <LearningPage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'finance') content = <FinancePage language={language} onUnauthorized={unauthorized} />;
  else if (route.page === 'wellness') content = <WellnessPage language={language} onUnauthorized={unauthorized} />;
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
    <AppDialogProvider language={language}>
      <FocusSessionProvider userId={user.id} onUnauthorized={unauthorized}>
        <AppShell user={user} page={route.page} language={language} themeMode={themeMode} themeError={themeError} audioItem={audioItem}
          onAudioStop={() => setAudioItem(null)} onThemeToggle={toggleTheme} setLanguage={changeLanguage} onLogout={logout} onUnauthorized={unauthorized}>
          {extensionCapture && <div className={`extension-capture-notice ${extensionCapture.type === 'error' ? 'error' : ''}`}
            role={extensionCapture.type === 'error' ? 'alert' : 'status'}>
            <span>{extensionCapture.type === 'saving'
              ? (language === 'ar' ? `جارٍ حفظ «${extensionCapture.title}»…` : `Saving “${extensionCapture.title}”…`)
              : extensionCapture.message}</span>
            {extensionCapture.type === 'error' && extensionCapture.token && <button type="button" onClick={() => {
              captureInFlight.current = '';
              saveExtensionCapture(true);
            }}>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button>}
            {extensionCapture.type !== 'saving' && <button type="button" aria-label={language === 'ar' ? 'إغلاق' : 'Dismiss'}
              onClick={() => setExtensionCapture(null)}>×</button>}
          </div>}
          <Suspense fallback={<section className="page-card"><p>{messages[language].loading}</p></section>}>
            {content}
          </Suspense>
          {['notes', 'memories', 'bookmarks', 'snippets', 'daily-note'].includes(route.page) && <section className="page-card">
            <div className="record-actions">
              <Link className="button button-quiet" to="/?view=notes">{language === 'ar' ? 'المقالات' : 'Articles'}</Link>
              <Link className="button button-quiet" to="/?view=memories">{messages[language].memories}</Link>
              <Link className="button button-quiet" to="/?view=bookmarks">{language === 'ar' ? 'الروابط المحفوظة' : 'Bookmarks'}</Link>
              <Link className="button button-quiet" to="/?view=daily-note">{language === 'ar' ? 'المذكرة اليومية' : 'Daily note'}</Link>
              <Link className="button button-quiet" to="/?view=snippets">{language === 'ar' ? 'المقاطع البرمجية' : 'Code snippets'}</Link>
            </div>
          </section>}
        </AppShell>
      </FocusSessionProvider>
    </AppDialogProvider>
  </div>;
}
