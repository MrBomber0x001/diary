import { useState } from 'react';
import { api } from '../api.js';
import { messages } from '../i18n.js';

export default function AuthScreen({ hasUsers, onAuthenticated, language, setLanguage }) {
  const [register, setRegister] = useState(!hasUsers);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = messages[language];

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST', body: { username, password },
      });
      onAuthenticated(result.user);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <span className="brand-mark" aria-hidden="true">✦</span>
        <h1>{t.app}</h1>
        <p className="auth-description">{register ? t.signUp : t.signIn}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <label>{t.username}<input autoComplete="username" required minLength="3" maxLength="32" value={username} onChange={event => setUsername(event.target.value)} /></label>
        <label>{t.password}<input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button className="button button-primary auth-submit" disabled={busy}>{busy ? t.loading : register ? t.signUp : t.signIn}</button>
        {hasUsers && <button className="auth-mode-toggle" type="button" onClick={() => { setRegister(!register); setError(''); }}>{register ? t.signIn : t.signUp}</button>}
        <button className="button button-quiet language-toggle" type="button" onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}>{language === 'ar' ? 'English' : 'العربية'}</button>
      </form>
    </main>
  );
}
