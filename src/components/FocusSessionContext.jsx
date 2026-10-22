import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const FocusSessionContext = createContext(null);

function getSavedSession(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!value || typeof value.key !== 'string' || !value.key
      || !Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 180
      || typeof value.contextLabel !== 'string'
      || !Number.isFinite(value.elapsedSeconds) || value.elapsedSeconds < 0
      || !Number.isFinite(value.startedAt) || value.startedAt <= 0
      || typeof value.paused !== 'boolean') return null;
    return value;
  } catch {
    return null;
  }
}

export function FocusSessionProvider({ userId, onUnauthorized, children }) {
  const storageKey = `personal-memo-focus-session-${userId}`;
  const [session, setSession] = useState(() => getSavedSession(storageKey));
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session || session.paused) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (session) localStorage.setItem(storageKey, JSON.stringify(session));
    else localStorage.removeItem(storageKey);
  }, [session, storageKey]);

  const handleFailure = useCallback(failure => {
    if (failure.status === 401) onUnauthorized();
    else setError(failure.message);
  }, [onUnauthorized]);

  const startSession = useCallback(async ({ minutes = 25, contextLabel = '' } = {}) => {
    setBusy(true);
    setError('');
    const key = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      await api('/focus/start', { method: 'POST', body: { session_key: key, focus_minutes: Number(minutes), context_label: contextLabel.trim() } });
      setSession({ key, minutes: Number(minutes), contextLabel: contextLabel.trim(), elapsedSeconds: 0, startedAt: Date.now(), paused: false });
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  }, [handleFailure]);

  const pauseSession = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/focus/pause', { method: 'POST', body: { session_key: session.key } });
      setSession(current => current ? { ...current, elapsedSeconds: result.elapsed_seconds, paused: true } : current);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  }, [handleFailure, session]);

  const resumeSession = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await api('/focus/start', { method: 'POST', body: { session_key: session.key, focus_minutes: session.minutes, context_label: session.contextLabel } });
      setSession(current => current ? { ...current, startedAt: Date.now(), paused: false } : current);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  }, [handleFailure, session]);

  const completeSession = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await api('/focus/complete', { method: 'POST', body: { session_key: session.key } });
      setSession(null);
      return true;
    } catch (failure) {
      handleFailure(failure);
      return false;
    } finally {
      setBusy(false);
    }
  }, [handleFailure, session]);

  const discardSession = useCallback(async () => {
    if (!session || !window.confirm(document.documentElement.lang === 'ar' ? 'هل تريد إلغاء جلسة التركيز الحالية؟' : 'Discard this focus session?')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/focus/${encodeURIComponent(session.key)}`, { method: 'DELETE' });
      setSession(null);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  }, [handleFailure, session]);

  const seconds = session
    ? session.elapsedSeconds + (session.paused ? 0 : Math.max(0, Math.floor((now - session.startedAt) / 1000)))
    : 0;
  const value = useMemo(() => ({
    session, seconds, busy, error, setError,
    startSession, pauseSession, resumeSession, completeSession, discardSession,
  }), [session, seconds, busy, error, startSession, pauseSession, resumeSession, completeSession, discardSession]);

  return <FocusSessionContext.Provider value={value}>{children}</FocusSessionContext.Provider>;
}

export function useFocusSession() {
  const value = useContext(FocusSessionContext);
  if (!value) throw new Error('useFocusSession must be used within FocusSessionProvider');
  return value;
}
