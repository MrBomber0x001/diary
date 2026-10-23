import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const AppDialogContext = createContext(null);

export function AppDialogProvider({ language, children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);
  const returnFocus = useRef(null);
  const inputRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const isArabic = language === 'ar';

  const close = useCallback(result => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  }, []);

  const open = useCallback(options => new Promise(resolve => {
    resolver.current?.(options.type === 'prompt' ? null : false);
    returnFocus.current = document.activeElement;
    resolver.current = resolve;
    setDialog(options);
  }), []);

  const confirm = useCallback(options => open({ type: 'confirm', ...options }), [open]);
  const prompt = useCallback(options => open({ type: 'prompt', value: options.initialValue || '', ...options }), [open]);

  useEffect(() => {
    if (!dialog) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const target = dialog.type === 'prompt' ? inputRef.current : cancelRef.current;
    target?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus?.();
    };
  }, [dialog?.type]);

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(dialog.type === 'prompt' ? null : false);
      return;
    }
    if (event.key === 'Enter' && dialog.type === 'prompt' && event.target === inputRef.current) {
      event.preventDefault();
      close(dialog.value);
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [inputRef.current, cancelRef.current, confirmRef.current].filter(Boolean);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const value = { confirm, prompt };
  return <>
    <AppDialogContext.Provider value={value}>{children}</AppDialogContext.Provider>
    {dialog && createPortal(
      <div className="app-dialog-backdrop" onMouseDown={event => {
        if (event.target === event.currentTarget) close(dialog.type === 'prompt' ? null : false);
      }}>
        <section
          className="app-dialog"
          role={dialog.type === 'confirm' ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby="app-dialog-title"
          aria-describedby="app-dialog-description"
          dir={isArabic ? 'rtl' : 'ltr'}
          onKeyDown={handleKeyDown}
        >
          <span className={`app-dialog-icon ${dialog.danger ? 'danger' : ''}`} aria-hidden="true">
            {dialog.danger ? '!' : dialog.type === 'prompt' ? '✎' : '?'}
          </span>
          <h2 id="app-dialog-title">{dialog.title || (isArabic ? 'تأكيد الإجراء' : 'Confirm action')}</h2>
          <p id="app-dialog-description">{dialog.message}</p>
          {dialog.type === 'prompt' && <label className="app-dialog-input-label">
            {dialog.inputLabel}
            <input
              ref={inputRef}
              type="text"
              value={dialog.value}
              maxLength={dialog.maxLength || 120}
              placeholder={dialog.placeholder}
              onChange={event => setDialog(current => ({ ...current, value: event.target.value }))}
            />
          </label>}
          <div className="app-dialog-actions">
            <button className="button button-quiet" type="button" ref={cancelRef}
              onClick={() => close(dialog.type === 'prompt' ? null : false)}>
              {dialog.cancelLabel || (isArabic ? 'إلغاء' : 'Cancel')}
            </button>
            <button className={`button ${dialog.danger ? 'button-danger' : 'button-primary'}`} type="button"
              ref={confirmRef} onClick={() => close(dialog.type === 'prompt' ? dialog.value : true)}>
              {dialog.confirmLabel || (dialog.type === 'prompt' ? (isArabic ? 'حفظ' : 'Save') : (isArabic ? 'تأكيد' : 'Confirm'))}
            </button>
          </div>
        </section>
      </div>,
      document.body,
    )}
  </>;
}

export function useAppDialog() {
  const value = useContext(AppDialogContext);
  if (!value) throw new Error('useAppDialog must be used within AppDialogProvider');
  return value;
}
