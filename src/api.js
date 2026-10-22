export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (body && !(body instanceof FormData) && !(body instanceof Blob) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(path.startsWith('/api/') ? path : `/api${path}`, {
    ...options,
    body,
    headers,
    credentials: 'same-origin',
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : await response.blob();
  if (!response.ok) {
    const error = new Error(result?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result;
}

export const todayDate = () => new Date().toLocaleDateString('en-CA');
