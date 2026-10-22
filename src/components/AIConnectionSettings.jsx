import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function AIConnectionSettings({ language, onUnauthorized }) {
  const arabic = language === 'ar';
  const [connection, setConnection] = useState(null);
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const result = await api('/interviews/ai/connection');
      setConnection(result);
      if (result.baseUrl) setBaseUrl(result.baseUrl);
      if (result.model) setModel(result.model);
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function testConnection() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/interviews/ai/connection/test', {
        method: 'POST',
        body: { baseUrl, model, apiKey },
      });
      setMessage(result.ok
        ? (arabic ? 'تم الاتصال بنجاح. يمكنك الآن حفظ الاتصال.' : 'Connection successful. You can save it now.')
        : (arabic ? 'لم يستجب مزود الذكاء الاصطناعي.' : 'The AI provider did not respond.'));
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveConnection(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/interviews/ai/connection', {
        method: 'PUT',
        body: { baseUrl, model, apiKey },
      });
      setConnection(result);
      setBaseUrl(result.baseUrl);
      setModel(result.model);
      setApiKey('');
      setMessage(arabic ? 'تم حفظ اتصال الذكاء الاصطناعي بأمان.' : 'AI connection saved securely.');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeConnection() {
    if (!window.confirm(arabic ? 'إزالة اتصال الذكاء الاصطناعي ومفتاحه؟' : 'Remove the AI connection and its API key?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/interviews/ai/connection', { method: 'DELETE' });
      setConnection(current => ({ ...current, configured: false, keyConfigured: false, baseUrl: '', model: '' }));
      setBaseUrl('https://api.openai.com/v1');
      setModel('');
      setApiKey('');
      setMessage(arabic ? 'تمت إزالة الاتصال.' : 'AI connection removed.');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="ai-connection-settings">
    <header><div><p className="eyebrow">{arabic ? 'مقابلات أذكى' : 'AI INTERVIEWER'}</p>
      <h2>{arabic ? 'اتصال مزود الذكاء الاصطناعي' : 'AI provider connection'}</h2>
      <p>{arabic
        ? 'يدعم واجهة OpenAI المتوافقة. المفتاح يُشفّر على الخادم ولا يُعرض بعد حفظه.'
        : 'Supports OpenAI-compatible chat endpoints. The key is encrypted on the server and never returned after saving.'}</p></div>
      {connection?.configured && <span className="ai-connection-status">{arabic ? 'متصل' : 'Connected'}</span>}
    </header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {connection && !connection.encryptionReady && <p className="notice error" role="alert">
      {arabic
        ? 'قبل الاتصال، يجب على مالك الخادم ضبط PERSONAL_MEMO_AI_ENCRYPTION_KEY وإعادة تشغيل التطبيق.'
        : 'Before connecting, the server owner must set PERSONAL_MEMO_AI_ENCRYPTION_KEY and restart the app.'}
    </p>}
    <form onSubmit={saveConnection}>
      <label>{arabic ? 'عنوان API المتوافق مع OpenAI' : 'OpenAI-compatible API base URL'}
        <input type="url" required maxLength="500" value={baseUrl} onChange={event => setBaseUrl(event.target.value)}
          placeholder="https://api.openai.com/v1" autoComplete="url" />
      </label>
      <label>{arabic ? 'اسم النموذج' : 'Model name'}
        <input required maxLength="120" value={model} onChange={event => setModel(event.target.value)}
          placeholder={arabic ? 'مثال: اسم النموذج لدى مزودك' : 'Example: your provider’s model name'} />
      </label>
      <label>{arabic ? 'مفتاح API' : 'API key'}
        <input type="password" maxLength="1000" value={apiKey} onChange={event => setApiKey(event.target.value)}
          placeholder={connection?.keyConfigured
            ? (arabic ? 'مفتاح محفوظ؛ اتركه فارغاً للإبقاء عليه' : 'Key saved; leave blank to keep it')
            : (arabic ? 'أدخل مفتاح API' : 'Enter API key')}
          autoComplete="new-password" />
      </label>
      <div className="ai-connection-actions">
        <button className="button button-quiet" type="button" disabled={busy || !connection?.encryptionReady} onClick={testConnection}>
          {busy ? (arabic ? 'جارٍ التحقق…' : 'Checking…') : (arabic ? 'اختبار الاتصال' : 'Test connection')}
        </button>
        <button className="button button-primary" type="submit" disabled={busy || !connection?.encryptionReady}>
          {arabic ? 'حفظ الاتصال' : 'Save connection'}
        </button>
        {connection?.configured && <button className="button button-danger" type="button" disabled={busy} onClick={removeConnection}>
          {arabic ? 'إزالة الاتصال' : 'Remove connection'}
        </button>}
      </div>
    </form>
    <p className="ai-connection-privacy">{arabic
      ? 'لا تُرسل معلومات سيرتك أو وصف الوظيفة إلا بعد اختيارها وتأكيد الإرسال لكل جلسة. بيانات الجلسات تُحفظ في حسابك. احتفظ بمتغير التشفير نفسه عند استعادة النسخ الاحتياطية.'
      : 'Your resume and job description are sent only when selected and explicitly confirmed for each session. Session history is saved to your account. Keep the same encryption secret when restoring backups.'}</p>
  </section>;
}
