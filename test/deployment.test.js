import { it, expect } from 'vitest';
import { staleNavigationResponse } from '../worker/deployment.js';

it('prevents old runtime/new navigation chunk mixing before reading the payload', async () => {
  const request = new Request('https://example.invalid/saved.txt?_rsc=example', { headers: { rsc: '1', 'x-deployment-id': 'old-build' } });
  const response = staleNavigationResponse(request, 'new-build');
  expect(response.status).toBe(409); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-deployment-id')).toBe('new-build');
  // Tabs opened before deployment identifiers were configured also recover.
  expect(staleNavigationResponse(new Request(request.url, { headers: { rsc: '1' } }), 'new-build').status).toBe(409);
});

it('allows same-build navigation, regular HTML, scripts and API requests', () => {
  const paths = [
    ['https://example.invalid/saved.txt', { rsc: '1', 'x-deployment-id': 'current' }],
    ['https://example.invalid/saved', { 'x-deployment-id': 'old' }],
    ['https://example.invalid/_next/static/chunks/example.js', {}],
    ['https://example.invalid/api/admin/users', { rsc: '1', 'x-deployment-id': 'old' }],
  ];
  for (const [url, headers] of paths) expect(staleNavigationResponse(new Request(url, { headers }), 'current')).toBeNull();
});
