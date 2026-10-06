import React from 'react';
import { createRoot } from 'react-dom/client';
import UsersTab from '../../app/admin/UsersTab.jsx';
import ErrorsTab from '../../app/admin/ErrorsTab.jsx';
import '../../app/globals.css';
import '../../app/auth.css';
import '../../app/admin.css';

const users = Array.from({ length: 76 }, (_, i) => ({ id: 'user-' + i, email: `long.email.address.${i}@example.invalid`, display_name: 'A User With A Long Display Name ' + i, role: i ? 'user' : 'admin', preferred_country: i % 2 ? 'BG' : 'GR', country_mode: i % 2 ? 'auto' : 'manual', language: i % 2 ? 'bg' : 'de', language_mode: i % 2 ? 'auto' : 'manual', created_at: '2026-10-01T12:00:00Z', last_active_at: new Date(Date.now() - i * 3600000).toISOString(), subscription_status: i ? null : 'active', plan_id: 'annual', premium_source: i ? null : 'administrator', current_period_end: Date.now() + 86400000, last_invoice_status: 'paid' }));
const errors = Array.from({ length: 225 }, (_, i) => ({ id: 225 - i, created_at: '2026-10-06T08:30:00Z', source: 'client', path: '/', method: 'GET', message: i === 0 ? 'Uncaught Error: Error invoking postMessage: Java object is gone' : i === 1 ? 'Script error.' : 'A genuine application failure ' + i + ' with a complete error message that should always wrap inside the table instead of being silently truncated', detail: i === 0 ? 'iabjs://navigation_performance_logger_android:1\n at sendDataToNative\n at sendJsBlockingTimeMessage\nUser agent: Synthetic Android test' : 'Original full stack details\n at app.js:14', user_id: 'synthetic-user' }));
window.fixtureRequests = [];
window.fixtureFail = null;
window.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin), method = options.method || 'GET';
  window.fixtureRequests.push({ path: url.pathname, page: url.searchParams.get('page'), size: url.searchParams.get('pageSize'), method });
  if (window.fixtureFail === url.pathname) return new Response(JSON.stringify({ error: 'synthetic_failure' }), { status: 503, headers: { 'content-type': 'application/json' } });
  if (method === 'PATCH') { const user = users.find(user => user.id === url.pathname.split('/').pop()); user.role = JSON.parse(options.body).role; }
  if (method === 'DELETE') errors.splice(0);
  const rows = url.pathname === '/api/admin/users' ? users : errors, key = rows === users ? 'users' : 'errors';
  const pageSize = Number(url.searchParams.get('pageSize') || 50), totalPages = Math.max(1, Math.ceil(rows.length / pageSize)), page = Math.min(Number(url.searchParams.get('page') || 1), totalPages);
  return new Response(JSON.stringify({ ok: true, [key]: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, pageSize, page, totalPages }), { headers: { 'content-type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<main className="shell admin"><UsersTab /><ErrorsTab /></main>);
