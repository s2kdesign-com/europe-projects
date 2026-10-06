import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import ActivityReporter from '../app/components/ActivityReporter.jsx';
import ErrorReporter from '../app/components/ErrorReporter.jsx';

const state = vi.hoisted(() => ({ authenticated: false, pathname: '/', report: vi.fn() }));
vi.mock('../app/hooks/useSession.js', () => ({ useSession: () => ({ authenticated: state.authenticated }) }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('../app/services/error-reporting.js', async importOriginal => ({ ...await importOriginal(), reportClientError: state.report }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); state.authenticated = false; state.pathname = '/'; state.report.mockClear(); });

it('only authenticated foreground entry/navigation records activity', async () => {
  const fetch = vi.fn(async () => ({ ok: true })); vi.stubGlobal('fetch', fetch);
  let time = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => time);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const view = render(<ActivityReporter />); expect(fetch).not.toHaveBeenCalled();
  state.authenticated = true; view.rerender(<ActivityReporter />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0][0]).toBe('/api/activity');
  time += 61000;
  state.pathname = '/procedures'; view.rerender(<ActivityReporter />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  time += 61000;
  state.pathname = '/calendar'; view.rerender(<ActivityReporter />);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('reports activity persistence failure rather than silently swallowing it', async () => {
  state.authenticated = true;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
  render(<ActivityReporter />);
  await waitFor(() => expect(state.report).toHaveBeenCalled());
  expect(state.report.mock.calls[0][0]).toMatchObject({ path: '/api/activity', method: 'POST', message: 'Activity update failed (HTTP 503)' });
});

it('captures native browser, opaque script, resource and rejection errors without suppressing any', () => {
  const view = render(<ErrorReporter />);
  const native = new Error('Error invoking postMessage: Java object is gone');
  native.stack = 'iabjs://navigation_performance_logger_android:1\n' + 'original stack\n'.repeat(300);
  for (let i = 0; i < 30; i++) window.dispatchEvent(new ErrorEvent('error', { message: native.message, error: native, filename: 'iabjs://navigation_performance_logger_android', lineno: 1 }));
  window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
  const script = document.createElement('script'); script.src = 'https://example.invalid/missing.js'; document.body.append(script); script.dispatchEvent(new Event('error'));
  const rejection = new Event('unhandledrejection'); Object.defineProperty(rejection, 'reason', { value: new Error('genuine rejection') }); window.dispatchEvent(rejection);
  expect(state.report).toHaveBeenCalledTimes(33);
  expect(state.report.mock.calls[0][0].detail).toContain(native.stack);
  expect(state.report.mock.calls[30][0].message).toBe('Script error.');
  expect(state.report.mock.calls[31][0].message).toContain('missing.js');
  view.unmount(); script.remove();
  window.dispatchEvent(new ErrorEvent('error', { message: 'unmounted' }));
  expect(state.report).toHaveBeenCalledTimes(33);
});
