import { lazy, Suspense, useEffect, useState } from 'react';
import { messages } from '../i18n.js';
import { api } from '../api.js';

const LexicalTextEditor = lazy(() => import('./LexicalTextEditor.jsx'));

function initialValue(field, source = {}) {
  const firstOption = field.type === 'select' && field.options?.length
    ? (typeof field.options[0] === 'object' ? field.options[0].value : field.options[0])
    : '';
  const value = source[field.key] ?? field.defaultValue ?? firstOption;
  if (field.type === 'checkbox') return Boolean(value);
  if (field.parse === 'lines') return Array.isArray(value) ? value.join('\n') : value;
  if (field.type === 'datetime-local' && typeof value === 'string') return value.slice(0, 16);
  return value;
}

export function convertFields(fields, values) {
  return fields.reduce((result, field) => {
    const value = values[field.key];
    if (field.parse === 'lines') result[field.key] = String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    else if (field.type === 'number') result[field.key] = value === '' ? null : Number(value);
    else result[field.key] = value;
    return result;
  }, {});
}

export default function Editor({ fields, value, language, onSubmit, onCancel, onUnauthorized, submitLabel, showCancel = true, quickCapture = false }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.key, initialValue(field, value)])));
  const [imageErrors, setImageErrors] = useState({});
  const [showMoreFields, setShowMoreFields] = useState(false);
  useEffect(() => {
    setValues(Object.fromEntries(fields.map(field => [field.key, initialValue(field, value)])));
    setShowMoreFields(false);
  }, [fields, value]);
  const t = messages[language];

  async function uploadImage(field, file) {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!supportedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      setImageErrors(current => ({ ...current, [field.key]: language === 'ar'
        ? 'ارفع صورة JPG أو PNG أو WEBP أو GIF بحجم أقصى ٥ ميغابايت.'
        : 'Choose a JPG, PNG, WEBP, or GIF image up to 5 MB.' }));
      return;
    }
    setImageErrors(current => ({ ...current, [field.key]: '' }));
    try {
      const image = await api('/gallery', {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type,
          'X-Image-Category': encodeURIComponent(language === 'ar' ? 'مراجعة' : 'Review'),
          'X-Image-Caption': encodeURIComponent(file.name.slice(0, 200)),
        },
      });
      return `![${file.name.replace(/[\[\]]/g, '')}](${image.url})`;
    } catch (failure) {
      if (failure.status === 401) {
        onUnauthorized?.();
        setImageErrors(current => ({ ...current, [field.key]: language === 'ar' ? 'انتهت الجلسة. سجّل الدخول ثم حاول مجدداً.' : 'Your session expired. Sign in and try again.' }));
      }
      else setImageErrors(current => ({ ...current, [field.key]: failure.message }));
    }
  }

  function fieldInput(field) {
    const common = {
      id: `field-${field.key}`,
      name: field.key,
      autoFocus: quickCapture && field.key === 'title',
      required: field.required,
      min: field.min,
      max: field.max,
      value: field.type === 'checkbox' ? undefined : values[field.key],
      checked: field.type === 'checkbox' ? values[field.key] : undefined,
      onChange: event => setValues(current => ({
        ...current,
        [field.key]: field.type === 'checkbox' ? event.target.checked : event.target.value,
      })),
    };
    if (field.type === 'textarea') {
      const markdown = field.key !== 'code';
      return <div className="markdown-editor">
        <Suspense fallback={<textarea {...common} dir={field.key === 'code' ? 'ltr' : 'auto'} rows={field.key === 'code' ? 9 : 5} />}>
          <LexicalTextEditor id={`field-${field.key}`} value={String(values[field.key] || '')}
            onChange={next => setValues(current => ({ ...current, [field.key]: next }))}
            language={language} code={!markdown}
            placeholder={field.label}
            onImageUpload={markdown ? file => uploadImage(field, file) : undefined}
            onImageError={message => setImageErrors(current => ({ ...current, [field.key]: message }))}
            autoFocus={quickCapture && field.key === 'title'} />
        </Suspense>
        {imageErrors[field.key] && <span className="image-upload-error" role="alert">{imageErrors[field.key]}</span>}
        {!imageErrors[field.key] && field.key !== 'code' && <span className="markdown-hint">{language === 'ar' ? 'يمكنك إسقاط صورة هنا أو رفعها من شريط الأدوات.' : 'Drop an image here or upload it from the toolbar.'}</span>}
      </div>;
    }
    if (field.type === 'select') return <select {...common}>{field.options.map(option => <option value={typeof option === 'object' ? option.value : option} key={typeof option === 'object' ? option.value : option}>{typeof option === 'object' ? option.label : option}</option>)}</select>;
    return <input {...common} type={field.type || 'text'} />;
  }

  function renderField(field) {
    return <label className={`${field.wide ? 'wide' : ''} ${field.type === 'checkbox' ? 'inline-checkbox' : ''}`} htmlFor={`field-${field.key}`} key={field.key}>
      {field.type === 'checkbox' ? fieldInput(field) : <>{field.label}<span>{fieldInput(field)}</span></>}
      {field.type === 'checkbox' ? field.label : null}
    </label>;
  }

  const quickFieldKeys = ['title', 'kind', 'creator', 'status', 'review', 'notes'];
  const primaryFields = quickCapture
    ? fields.filter(field => quickFieldKeys.includes(field.key)).sort((first, second) => first.key === 'title' ? -1 : second.key === 'title' ? 1 : 0)
    : fields;
  const extraFields = quickCapture ? fields.filter(field => !quickFieldKeys.includes(field.key)) : [];
  return (
    <form className={`editor${quickCapture ? ' editor-quick-capture' : ''}`} onSubmit={event => { event.preventDefault(); onSubmit(convertFields(fields, values)); }}
      onKeyDown={event => { if (quickCapture && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
      {primaryFields.map(renderField)}
      {extraFields.length > 0 && <>
        <button className="editor-more-toggle" type="button" aria-expanded={showMoreFields} onClick={() => setShowMoreFields(current => !current)}>
          <span aria-hidden="true">{showMoreFields ? '−' : '+'}</span>{showMoreFields ? (language === 'ar' ? 'إخفاء التفاصيل' : 'Hide details') : (language === 'ar' ? 'تفاصيل إضافية' : 'More details')}
        </button>
        {showMoreFields && <div className="editor-extra-fields">{extraFields.map(renderField)}</div>}
      </>}
      <div className="editor-actions">
        <button className="button button-primary" type="submit">{submitLabel || t.submit}{quickCapture && <span className="editor-shortcut">Ctrl ↵</span>}</button>
        {showCancel && <button className="button button-quiet" type="button" onClick={onCancel}>{t.cancel}</button>}
      </div>
    </form>
  );
}
