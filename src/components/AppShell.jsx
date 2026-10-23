import { useEffect, useRef, useState } from 'react';
import { messages } from '../i18n.js';
import { Link } from '../navigation.jsx';
import NotificationsCenter from './NotificationsCenter.jsx';
import QuickNoteWidget from './QuickNoteWidget.jsx';

function PersistentAudioPlayer({ item, onStop, language }) {
  const playerRef = useRef(null);
  const [playbackError, setPlaybackError] = useState('');

  useEffect(() => {
    if (!item?.src || !playerRef.current) return;
    setPlaybackError('');
    playerRef.current.play().catch(() => {
      setPlaybackError(language === 'ar' ? 'اضغط تشغيل للمتابعة.' : 'Press play to resume audio.');
    });
  }, [item?.src, language]);

  if (!item) return null;
  return <div className="persistent-audio-dock">
    <span className="persistent-audio-icon" aria-hidden="true">♫</span>
    <div className="persistent-audio-copy"><strong>{item.title}</strong><span>{language === 'ar' ? 'يستمر التشغيل أثناء التنقل' : 'Keeps playing as you navigate'}</span></div>
    <audio ref={playerRef} src={item.src} controls preload="none" onError={() => setPlaybackError(language === 'ar' ? 'تعذر تشغيل هذا المصدر الصوتي.' : 'This audio source could not be played.')} />
    {playbackError && <span className="persistent-audio-error" role="status">{playbackError}</span>}
    <button className="icon-button" type="button" onClick={onStop} title={language === 'ar' ? 'إيقاف الصوت' : 'Stop audio'} aria-label={language === 'ar' ? 'إيقاف الصوت' : 'Stop audio'}>×</button>
  </div>;
}

const navGroups = [
  [['home', 'today', '⌂'], ['library', 'library', '▤'], ['tasks', 'tasks', '✓'], ['calendar', 'calendar', '▦'], ['timeline', 'timeline', '◷']],
  [['planning', 'planning', '◎'], ['habits', 'habits', '✳'], ['notes', 'notes', '✎'], ['memories', 'memories', '♡'], ['learning', 'learning', '↗']],
  [['finance', 'finance', '$'], ['clubs', 'clubs', '◉'], ['interviews', 'interviews', '◷'], ['gallery', 'gallery', '▧']],
  [['wellness', 'wellness', '♡'], ['focus', 'focus', '◌'], ['quran', 'quran', '☾'], ['settings', 'settings', '⚙']],
];

export default function AppShell({ user, page, language, themeMode, themeError, audioItem, onAudioStop, onThemeToggle, setLanguage, onLogout, onUnauthorized, children }) {
  const t = messages[language];
  const current = page === 'item' ? 'library' : page;
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/?view=today"><span className="brand-mark">✦</span><strong>{t.app}</strong></Link>
        <div className="top-actions">
          <NotificationsCenter user={user} language={language} onUnauthorized={onUnauthorized} />
          <Link className="button button-quiet header-quran-link" to="/?view=quran" aria-label={language === 'ar' ? 'القرآن والصلاة' : 'Quran and prayer'}>
            <span aria-hidden="true">☾</span><span>{language === 'ar' ? 'القرآن والصلاة' : 'Quran & prayer'}</span>
          </Link>
          <button className="button button-quiet theme-toggle" type="button" onClick={onThemeToggle}
            aria-label={themeMode === 'dark' ? (language === 'ar' ? 'التبديل إلى المظهر الفاتح' : 'Switch to light theme') : (language === 'ar' ? 'التبديل إلى المظهر الداكن' : 'Switch to dark theme')}
            title={themeMode === 'dark' ? (language === 'ar' ? 'المظهر الفاتح' : 'Light theme') : (language === 'ar' ? 'المظهر الداكن' : 'Dark theme')}>
            <span aria-hidden="true">{themeMode === 'dark' ? '☀' : '☾'}</span>
          </button>
          <span className="account-name">{user.username}</span>
          <button className="button button-quiet" type="button" onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}>{language === 'ar' ? 'English' : 'العربية'}</button>
          <button className="button button-quiet" type="button" onClick={onLogout}>{t.logout}</button>
        </div>
        {themeError && <span className="theme-error" role="alert">{themeError}</span>}
      </header>
      <PersistentAudioPlayer item={audioItem} onStop={onAudioStop} language={language} />
      <div className="app-layout">
        <nav className="workspace-nav" aria-label={language === 'ar' ? 'أقسام مساحة العمل' : 'Workspace'}>
          {navGroups.map((group, index) => (
            <div className="workspace-nav-group" key={index}>
              {group.map(([key, path, icon]) => (
                <Link className={`workspace-nav-link ${current === path ? 'active' : ''}`} key={key} to={`/?view=${path}`}>
                  <span aria-hidden="true">{icon}</span><span className="workspace-nav-label">{t[key]}</span>
                </Link>
              ))}
            </div>
          ))}
          <div className="rail-note"><span aria-hidden="true">✦</span><p>{t.welcome}</p></div>
        </nav>
        <main className="workspace-content" key={page}>
          {children}
        </main>
      </div>
      <QuickNoteWidget language={language} onUnauthorized={onUnauthorized} />
    </div>
  );
}
