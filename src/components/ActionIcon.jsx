export default function ActionIcon({ action, label, onClick, className = '' }) {
  const paths = {
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    delete: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  };
  return (
    <button
      className={`icon-button action-icon action-icon-${action} ${className}`.trim()}
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[action]}</svg>
    </button>
  );
}
