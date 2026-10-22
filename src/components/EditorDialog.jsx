import { useEffect } from 'react';
import ActionIcon from './ActionIcon.jsx';

export default function EditorDialog({ title, language, onClose, children }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="editor-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-dialog-title" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <header className="editor-dialog-header">
          <div><span className="editor-dialog-kicker">{language === 'ar' ? 'مساحة التحرير' : 'QUICK EDIT'}</span><h2 id="editor-dialog-title">{title}</h2></div>
          <ActionIcon action="close" label={language === 'ar' ? 'إغلاق' : 'Close'} onClick={onClose} />
        </header>
        {children}
      </section>
    </div>
  );
}
