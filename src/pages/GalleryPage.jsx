import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { messages } from '../i18n.js';
import ActionIcon from '../components/ActionIcon.jsx';

export default function GalleryPage({ language, onUnauthorized }) {
  const [images, setImages] = useState([]);
  const [error, setError] = useState('');
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState('شخصي');
  const input = useRef(null);
  const t = messages[language];
  const load = useCallback(async () => {
    try { setImages(await api('/gallery')); }
    catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
  }, [onUnauthorized]);
  useEffect(() => { load(); }, [load]);

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const row = await api('/gallery', {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type,
          'X-Image-Category': encodeURIComponent(category),
          'X-Image-Caption': encodeURIComponent(caption),
        },
      });
      setImages(current => [row, ...current]);
      setCaption('');
    } catch (failure) { if (failure.status === 401) onUnauthorized(); else setError(failure.message); }
    finally { event.target.value = ''; }
  }
  async function remove(id) {
    try { await api(`/gallery/${id}`, { method: 'DELETE' }); setImages(current => current.filter(image => image.id !== id)); }
    catch (failure) { setError(failure.message); }
  }
  return <section className="page-card">
    <header className="page-heading"><div><h1>{t.gallery}</h1><p>{images.length} صورة</p></div></header>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="page-tools">
      <label>التصنيف <input value={category} maxLength="40" onChange={event => setCategory(event.target.value)} /></label>
      <label>الوصف <input value={caption} maxLength="200" onChange={event => setCaption(event.target.value)} /></label>
      <button className="button button-primary" type="button" onClick={() => input.current?.click()}>＋ إضافة صورة</button>
      <input ref={input} className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={upload} />
    </div>
    {images.length ? <div className="record-grid">{images.map(image => <article className="record-card" key={image.id}>
      <img src={image.url} alt={image.caption || image.category} loading="lazy" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 10 }} />
      <h3>{image.caption || image.category}</h3><p>{image.created_at}</p>
      <ActionIcon action="delete" label={`${t.delete}: ${image.caption || image.category}`} onClick={() => remove(image.id)} />
    </article>)}</div> : <p>{t.empty}</p>}
  </section>;
}
