import { useCallback, useSyncExternalStore } from 'react';

function subscribe(callback) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

export function currentLocation() {
  return `${window.location.pathname}${window.location.search}`;
}

export function useLocation() {
  return useSyncExternalStore(subscribe, currentLocation, () => '/');
}

export function navigate(path) {
  if (path === currentLocation()) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function useNavigate() {
  return useCallback(navigate, []);
}

export function Link({ to, onClick, children, ...props }) {
  return (
    <a
      href={to}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
      {...props}
    >
      {children}
    </a>
  );
}
