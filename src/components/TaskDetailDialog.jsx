import { useEffect, useState } from 'react';
import ActionIcon from './ActionIcon.jsx';
import { api } from '../api.js';
import { useAppDialog } from './AppDialogProvider.jsx';

export default function TaskDetailDialog({ task, language, onClose, onEdit, onDelete, onUnauthorized, onCountsChange }) {
  const [subtasks, setSubtasks] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { confirm } = useAppDialog();
  const isArabic = language === 'ar';
  const completedCount = subtasks.filter(item => item.completed).length;
  const progress = subtasks.length ? Math.round(completedCount / subtasks.length * 100) : 0;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api(`/todos/${task.id}/subtasks`).then(result => {
      if (!active) return;
      setSubtasks(result);
      onCountsChange(task.id, result.length, result.filter(item => item.completed).length);
    }).catch(failure => {
      if (!active) return;
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [task.id, onCountsChange, onUnauthorized]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function updateSubtasks(next) {
    setSubtasks(next);
    onCountsChange(task.id, next.length, next.filter(item => item.completed).length);
  }

  async function addSubtask(event) {
    event.preventDefault();
    const title = draft.trim();
    if (!title || saving) return;
    setSaving(true);
    setError('');
    try {
      const created = await api(`/todos/${task.id}/subtasks`, { method: 'POST', body: { title } });
      updateSubtasks([...subtasks, created]);
      setDraft('');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubtask(subtask) {
    setError('');
    try {
      const updated = await api(`/todos/${task.id}/subtasks/${subtask.id}`, {
        method: 'PUT',
        body: { completed: !Boolean(subtask.completed) },
      });
      updateSubtasks(subtasks.map(item => item.id === updated.id ? updated : item));
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function removeSubtask(subtask) {
    if (!await confirm({
      title: isArabic ? 'حذف الخطوة؟' : 'Delete this step?',
      message: isArabic ? `هل تريد حذف «${subtask.title}»؟` : `Delete “${subtask.title}”?`,
      confirmLabel: isArabic ? 'حذف' : 'Delete',
      danger: true,
    })) return;
    setError('');
    try {
      await api(`/todos/${task.id}/subtasks/${subtask.id}`, { method: 'DELETE' });
      updateSubtasks(subtasks.filter(item => item.id !== subtask.id));
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  const dueLabel = task.due_date
    ? new Date(`${task.due_date}T12:00:00`).toLocaleDateString(isArabic ? 'ar' : 'en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : isArabic ? 'بلا تاريخ' : 'No date';

  return (
    <div className="task-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="task-detail-panel" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" dir={isArabic ? 'rtl' : 'ltr'}>
        <header className="task-detail-header">
          <div><span className="task-detail-kicker">{isArabic ? 'تفاصيل المهمة' : 'TASK DETAILS'}</span>
            <span className="task-detail-project">{task.project_title || (isArabic ? 'الوارد' : 'Inbox')}</span></div>
          <ActionIcon action="close" label={isArabic ? 'إغلاق' : 'Close'} onClick={onClose} />
        </header>
        <div className="task-detail-scroll">
          <div className="task-detail-title-row">
            <span className={`task-priority task-priority-${task.priority || 4}`}>P{task.priority || 4}</span>
            <h2 id="task-detail-title">{task.title}</h2>
          </div>
          <div className="task-detail-metadata">
            <span><i aria-hidden="true">◷</i>{dueLabel}{task.due_time ? ` · ${task.due_time}` : ''}</span>
            <span className={`task-priority task-priority-${task.priority || 4}`}>{isArabic ? 'الأولوية' : 'Priority'} P{task.priority || 4}</span>
          </div>
          {task.notes && <section className="task-detail-notes"><h3>{isArabic ? 'ملاحظات' : 'Notes'}</h3><p dir="auto">{task.notes}</p></section>}
          {error && <div className="notice error" role="alert">{error}</div>}
          <section className="task-subtasks">
            <div className="task-subtasks-heading">
              <div><h3>{isArabic ? 'الخطوات الفرعية' : 'Subtasks'}</h3>
                <span>{subtasks.length ? `${completedCount} / ${subtasks.length} ${isArabic ? 'مكتملة' : 'completed'}` : (isArabic ? 'قسّم المهمة إلى خطوات صغيرة' : 'Break this task into smaller steps')}</span></div>
              {subtasks.length > 0 && <strong>{progress}%</strong>}
            </div>
            {subtasks.length > 0 && <div className="task-subtasks-progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
              <span style={{ width: `${progress}%` }} />
            </div>}
            {loading ? <p className="task-subtasks-loading">{isArabic ? 'جارٍ تحميل الخطوات…' : 'Loading steps…'}</p> : (
              <ul className="task-subtask-list">
                {subtasks.map(subtask => <li key={subtask.id} className={subtask.completed ? 'completed' : ''}>
                  <label><input type="checkbox" checked={Boolean(subtask.completed)} onChange={() => toggleSubtask(subtask)} />
                    <span className="task-subtask-check" aria-hidden="true">{subtask.completed ? '✓' : ''}</span>
                    <span>{subtask.title}</span></label>
                  <ActionIcon action="delete" label={`${isArabic ? 'حذف' : 'Delete'}: ${subtask.title}`} onClick={() => removeSubtask(subtask)} />
                </li>)}
                {!subtasks.length && <li className="task-subtask-empty">{isArabic ? 'لا توجد خطوات بعد. أضف أول خطوة أدناه.' : 'No steps yet. Add the first one below.'}</li>}
              </ul>
            )}
            <form className="task-subtask-add" onSubmit={addSubtask}>
              <span aria-hidden="true">＋</span>
              <input autoComplete="off" aria-label={isArabic ? 'خطوة فرعية جديدة' : 'New subtask'} value={draft}
                onChange={event => setDraft(event.target.value)} placeholder={isArabic ? 'أضف خطوة…' : 'Add a step…'} maxLength={200} />
              <button type="submit" className="button button-primary" disabled={!draft.trim() || saving}>{isArabic ? 'إضافة' : 'Add'}</button>
            </form>
          </section>
        </div>
        <footer className="task-detail-footer">
          <ActionIcon action="delete" label={`${isArabic ? 'حذف' : 'Delete'}: ${task.title}`} onClick={() => onDelete(task)} />
          <button type="button" className="button button-quiet" onClick={onClose}>{isArabic ? 'إغلاق' : 'Close'}</button>
          <button type="button" className="button button-primary" onClick={() => onEdit(task)}>{isArabic ? 'تحرير المهمة' : 'Edit task'}</button>
        </footer>
      </aside>
    </div>
  );
}
