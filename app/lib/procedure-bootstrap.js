import { procedurePath } from './public-url.js';

// Public data only, emitted by the Worker into the exported procedure shell.
export function readProcedureBootstrap() {
  if (typeof document === 'undefined') return null;
  try {
    const data = JSON.parse(document.getElementById('procedure-data')?.textContent || 'null');
    return data?.project?.id && Array.isArray(data.documents) ? data : null;
  } catch { return null; }
}

export function initialProcedureNavigation() {
  const data = readProcedureBootstrap();
  const saved = window.history.state?.euroProcedure;
  if (saved?.path === window.location.pathname) return saved;
  if (data && procedurePath(data.project) === window.location.pathname) {
    return { id: data.project.id, path: procedurePath(data.project), returnUrl: '/procedures' + window.location.search };
  }
  return null;
}
