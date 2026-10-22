import { useEffect, useState } from 'react';
import { messages } from '../i18n.js';
import MarkdownContent from './MarkdownContent.jsx';
import { api } from '../api.js';

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
  const [preview, setPreview] = useState({});
  const [imageUploads, setImageUploads] = useState({});
  const [imageErrors, setImageErrors] = useState({});
  const [showMoreFields, setShowMoreFields] = useState(false);
  useEffect(() => {
    setValues(Object.fromEntries(fields.map(field => [field.key, initialValue(field, value)])));
    setShowMoreFields(false);
  }, [fields, value]);
  const t = messages[language];

  function insertMarkdown(field, before, after = '') {
    const input = document.getElementById(`field-${field.key}`);
    const start = input?.selectionStart ?? String(values[field.key] || '').length;
    const end = input?.selectionEnd ?? start;
    const current = String(values[field.key] || '');
    const selected = current.slice(start, end) || (language === 'ar' ? 'نص' : 'text');
    const replacement = `${before}${selected}${after}`;
    const updated = `${current.slice(0, start)}${replacement}${current.slice(end)}`;
    setValues(previous => ({ ...previous, [field.key]: updated }));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  async function uploadImage(field, file) {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!supportedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      setImageErrors(current => ({ ...current, [field.key]: language === 'ar'
        ? 'ارفع صورة JPG أو PNG أو WEBP أو GIF بحجم أقصى ٥ ميغابايت.'
        : 'Choose a JPG, PNG, WEBP, or GIF image up to 5 MB.' }));
      return;
    }
    setImageErrors(current => ({ ...current, [field.key]: '' }));
    setImageUploads(current => ({ ...current, [field.key]: true }));
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
      const textarea = document.getElementById(`field-${field.key}`);
      const current = String(values[field.key] || '');
      const start = textarea?.selectionStart ?? current.length;
      const end = textarea?.selectionEnd ?? start;
      const markdown = `![${file.name.replace(/[\[\]]/g, '')}](${image.url})`;
      const updated = `${current.slice(0, start)}${markdown}${current.slice(end)}`;
      setValues(previous => ({ ...previous, [field.key]: updated }));
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(start + markdown.length, start + markdown.length);
      });
    } catch (failure) {
      if (failure.status === 401) {
        onUnauthorized?.();
        setImageErrors(current => ({ ...current, [field.key]: language === 'ar' ? 'انتهت الجلسة. سجّل الدخول ثم حاول مجدداً.' : 'Your session expired. Sign in and try again.' }));
      }
      else setImageErrors(current => ({ ...current, [field.key]: failure.message }));
    } finally {
      setImageUploads(current => ({ ...current, [field.key]: false }));
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
        {markdown && <div className="markdown-toolbar" aria-label={language === 'ar' ? 'تنسيق Markdown' : 'Markdown formatting'}>
          <button type="button" title="Heading" onClick={() => insertMarkdown(field, '## ', '')}>H</button>
          <button type="button" title="Bold" onClick={() => insertMarkdown(field, '**', '**')}><strong>B</strong></button>
          <button type="button" title="Italic" onClick={() => insertMarkdown(field, '*', '*')}><em>I</em></button>
          <button type="button" title="Quote" onClick={() => insertMarkdown(field, '> ', '')}>❞</button>
          <button type="button" title="Bullet list" onClick={() => insertMarkdown(field, '- ', '')}>•</button>
          <button type="button" title="Link" onClick={() => insertMarkdown(field, '[', '](https://)')}>↗</button>
          <button type="button" title="Image" onClick={() => insertMarkdown(field, '![', '](https://image-url)')}>▧</button>
          <button type="button" title={language === 'ar' ? 'رفع صورة' : 'Upload image'} disabled={imageUploads[field.key]} onClick={() => document.getElementById(`image-${field.key}`)?.click()}>
            {imageUploads[field.key] ? '…' : '⬆'}
          </button>
          <input id={`image-${field.key}`} className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={event => { const file = event.target.files?.[0]; if (file) uploadImage(field, file); event.target.value = ''; }} />
          <button type="button" className="markdown-preview-toggle" aria-label={preview[field.key] ? (language === 'ar' ? 'العودة للتحرير' : 'Return to editing') : (language === 'ar' ? 'معاينة' : 'Preview')}
            title={preview[field.key] ? (language === 'ar' ? 'العودة للتحرير' : 'Return to editing') : (language === 'ar' ? 'معاينة' : 'Preview')}
            onClick={() => setPreview(current => ({ ...current, [field.key]: !current[field.key] }))}>
            <span aria-hidden="true">{preview[field.key] ? '✎' : '◉'}</span>
          </button>
        </div>}
        {preview[field.key] && markdown
          ? <div className="markdown-editor-preview"><MarkdownContent>{values[field.key]}</MarkdownContent></div>
          : <textarea {...common} dir={field.key === 'code' ? 'ltr' : 'auto'} rows={field.key === 'code' ? 9 : 5}
            onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
            onDrop={event => { const file = [...event.dataTransfer.files].find(candidate => candidate.type.startsWith('image/')); if (file) { event.preventDefault(); uploadImage(field, file); } }} />}
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
