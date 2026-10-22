import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { messages } from '../i18n.js';
import AIConnectionSettings from '../components/AIConnectionSettings.jsx';

export default function SettingsPage({ language, onLanguageChange, onThemeChange, onUnauthorized }) {
  const [settings, setSettings] = useState(null);
  const [backups, setBackups] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const t = messages[language];
  const load = useCallback(async () => {
    try {
      const [preferences, files] = await Promise.all([
        api('/settings'),
        api('/backups').catch(() => []),
      ]);
      setSettings(preferences);
      setBackups(files);
    } catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { load(); }, [load]);

  async function save(event) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const notificationsEnabled = form.get('notificationsEnabled') === 'on';
      const browserNotificationsAvailable = 'Notification' in window;
      let notificationPermission = browserNotificationsAvailable ? Notification.permission : 'unsupported';
      if (notificationsEnabled && browserNotificationsAvailable && Notification.permission === 'default') {
        notificationPermission = await Notification.requestPermission();
      }
      const body = {
        ...settings,
        language: form.get('language'),
        themeMode: form.get('themeMode'),
        notificationsEnabled,
        reminderMinutes: Number(form.get('reminderMinutes')),
        financeCurrency: form.get('financeCurrency'),
        prayerLocation: form.get('prayerLocation'),
        prayerLatitude: form.get('prayerLatitude') === '' ? null : Number(form.get('prayerLatitude')),
        prayerLongitude: form.get('prayerLongitude') === '' ? null : Number(form.get('prayerLongitude')),
        focusDurationMinutes: Number(form.get('focusDurationMinutes')),
        focusBreakMinutes: Number(form.get('focusBreakMinutes')),
      };
      const result = await api('/settings', { method: 'PUT', body });
      setSettings(result);
      onLanguageChange(result.language || form.get('language'));
      onThemeChange(result.themeMode || form.get('themeMode'));
      setNotice(notificationsEnabled && notificationPermission === 'denied'
        ? (language === 'ar' ? 'حُفظت الإعدادات، لكن المتصفح حظر الإشعارات. يمكنك السماح بها من إعدادات الموقع.' : 'Settings saved, but browser notifications are blocked. Allow them in site settings.')
        : (language === 'ar' ? 'تم حفظ الإعدادات.' : 'Settings saved.'));
    } catch (failure) { setError(failure.message); }
  }

  async function createBackup() {
    try {
      const result = await api('/backups', { method: 'POST', body: {} });
      setNotice(result.message || 'تم إنشاء النسخة الاحتياطية.');
      await load();
    } catch (failure) { setError(failure.message); }
  }

  async function restore(event) {
    event.preventDefault();
    const file = event.currentTarget.elements.backup.files[0];
    if (!file) return setError('اختر ملفاً أولاً.');
    const body = new FormData();
    body.append('backup', file);
    try {
      const response = await fetch('/api/backups/restore-archive', { method: 'POST', credentials: 'same-origin', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setNotice(result.message || 'تمت الاستعادة. سجّل الدخول مجدداً.');
      window.location.reload();
    } catch (failure) { setError(failure.message); }
  }

  if (!settings) return <section className="page-card">{error || t.loading}</section>;
  return (
    <section className="page-card">
      <header className="page-heading"><div><h1>{t.settings}</h1><p>{settings.username || ''}</p></div></header>
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <form className="editor" onSubmit={save}>
        <label>اللغة<select name="language" defaultValue={settings.language || language}><option value="ar">العربية</option><option value="en">English</option></select></label>
        <label>{language === 'ar' ? 'المظهر' : 'Appearance'}<select name="themeMode" defaultValue={settings.themeMode}>
          <option value="system">{language === 'ar' ? 'حسب إعداد الجهاز' : 'Match system'}</option>
          <option value="light">{language === 'ar' ? 'فاتح' : 'Light'}</option>
          <option value="dark">{language === 'ar' ? 'داكن' : 'Dark'}</option>
        </select></label>
        <fieldset className="notification-preferences">
          <legend>{language === 'ar' ? 'التنبيهات' : 'Notifications'}</legend>
          <label className="inline-checkbox"><input type="checkbox" name="notificationsEnabled" defaultChecked={settings.notificationsEnabled} />
            <span>{language === 'ar' ? 'السماح بإشعارات المتصفح عند فتح التطبيق' : 'Allow browser notifications while the app is open'}</span></label>
          <label>{language === 'ar' ? 'التنبيه قبل الموعد' : 'Remind me before'}<select name="reminderMinutes" defaultValue={settings.reminderMinutes || 15}>
            {[5, 10, 15, 30, 60].map(minutes => <option key={minutes} value={minutes}>{language === 'ar' ? `قبل ${minutes} دقيقة` : `${minutes} minutes before`}</option>)}
          </select></label>
          <p>{language === 'ar' ? 'يظل مركز الإشعارات داخل التطبيق متاحاً حتى عند إيقاف إشعارات المتصفح.' : 'The in-app notification center remains available when browser notifications are off.'}</p>
        </fieldset>
        <label>العملة<select name="financeCurrency" defaultValue={settings.financeCurrency}><option>EGP</option><option>SAR</option><option>AED</option><option>USD</option><option>EUR</option><option>GBP</option><option>KWD</option><option>QAR</option></select></label>
        <label>موقع الصلاة<input name="prayerLocation" defaultValue={settings.prayerLocation} /></label>
        <label>خط العرض<input name="prayerLatitude" type="number" step="any" defaultValue={settings.prayerLatitude ?? ''} /></label>
        <label>خط الطول<input name="prayerLongitude" type="number" step="any" defaultValue={settings.prayerLongitude ?? ''} /></label>
        <label>مدة التركيز (دقيقة)<input name="focusDurationMinutes" type="number" min="1" max="180" defaultValue={settings.focusDurationMinutes} /></label>
        <label>مدة الاستراحة (دقيقة)<input name="focusBreakMinutes" type="number" min="1" max="90" defaultValue={settings.focusBreakMinutes} /></label>
        <div className="editor-actions"><button className="button button-primary">{t.save}</button></div>
      </form>
      <AIConnectionSettings language={language} onUnauthorized={onUnauthorized} />
      {settings.isOwner && <section className="backup-settings">
        <h2>النسخ الاحتياطية</h2>
        <button className="button button-primary" onClick={createBackup}>إنشاء نسخة احتياطية الآن</button>
        <div className="record-grid">{backups.map(file => <article className="record-card" key={file.filename || file.name}>
          <h3>{file.filename || file.name}</h3><a className="button button-quiet" href={`/api/backups/${encodeURIComponent(file.filename || file.name)}`}>تنزيل</a>
        </article>)}</div>
        <form className="editor" onSubmit={restore}>
          <label className="wide">استعادة أرشيف ZIP شامل<input name="backup" type="file" accept=".zip,application/zip" required /></label>
          <div className="editor-actions"><button className="button button-quiet">استعادة الأرشيف</button></div>
        </form>
      </section>}
    </section>
  );
}
