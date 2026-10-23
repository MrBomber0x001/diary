import { useEffect } from 'react';
import ActionIcon from './ActionIcon.jsx';
import Editor from './Editor.jsx';

export default function WritingDialog({ title, fields, value, bodyKey, language, onSubmit, onCancel, onUnauthorized, error = '' }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="writing-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="writing-dialog" role="dialog" aria-modal="true" aria-labelledby="writing-dialog-title" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <header className="writing-dialog-header">
          <div className="writing-dialog-brand"><span aria-hidden="true">✎</span><span>{language === 'ar' ? 'مساحة الكتابة' : 'WRITING SPACE'}</span></div>
          <div className="writing-dialog-controls">
            <span>{language === 'ar' ? 'Ctrl + Enter للحفظ' : 'Ctrl + Enter to save'}</span>
            <ActionIcon action="close" label={language === 'ar' ? 'إغلاق' : 'Close'} onClick={onCancel} />
          </div>
        </header>
        <div className="writing-dialog-scroll">
          <div className="writing-dialog-heading">
              <span>{language === 'ar' ? value.id ? 'تحرير' : 'عنصر جديد' : value.id ? 'EDITING' : 'A NEW ENTRY'}</span>
              <h2 id="writing-dialog-title">{title}</h2>
              <p>{language === 'ar' ? 'ابدأ بالكتابة. يمكنك إضافة التفاصيل عندما تحتاجها.' : 'Start writing. Add extra details only when you need them.'}</p>
          </div>
            {error && <div className="notice error writing-error" role="alert">{error}</div>}
            <Editor fields={fields} value={value} bodyKey={bodyKey} writingMode language={language}
            onSubmit={onSubmit} onCancel={onCancel} onUnauthorized={onUnauthorized}
            submitLabel={language === 'ar' ? 'حفظ' : 'Save'} />
        </div>
      </section>
    </div>
  );
}
