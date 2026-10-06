import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { listUsersPage, listErrorsPage, logError } from '../worker/db.js';
import { createSession, getSession, recordUserActivity, destroySessionByToken } from '../worker/session.js';
import { handleAuth } from '../worker/handlers.js';

const db = new DatabaseSync(':memory:');
const migration = name => db.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
for (const name of ['0002_auth.sql', '0003_admin.sql', '0005_language.sql', '0029_web_push.sql', '0031_premium_billing.sql']) migration(name);
db.exec("ALTER TABLE user_profiles ADD COLUMN preferred_country TEXT; ALTER TABLE user_profiles ADD COLUMN country_mode TEXT DEFAULT 'auto'; ALTER TABLE user_profiles ADD COLUMN country_detection_enabled INTEGER DEFAULT 1;");
const seed = db.prepare('INSERT INTO users(id,email,role,created_at,updated_at,last_login_at) VALUES(?,?,?,?,?,?)');
for (let i = 0; i < 76; i++) seed.run(`user-${String(i).padStart(3, '0')}`, `user${i}@example.invalid`, i === 0 ? 'admin' : 'user', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z');
migration('0045_user_activity.sql');
migration('0046_automatic_user_locale.sql');
db.exec("INSERT INTO user_profiles(user_id,preferred_country,country_mode,created_at,updated_at) VALUES('user-075','GR','manual','2026-01-01','2026-01-01'); INSERT INTO user_preferences(user_id,language,language_mode,created_at,updated_at) VALUES('user-075','de','manual','2026-01-01','2026-01-01');");
const prepare = sql => {
  let values = [];
  const execute = () => { const args = []; const query = sql.replace(/\?(\d+)/g, (_, n) => { args.push(values[Number(n) - 1]); return '?'; }); return { stmt: db.prepare(query), args }; };
  const statement = {
    bind(...args) { values = args; return statement; },
    async all() { const { stmt, args } = execute(); return { results: stmt.all(...args) }; },
    async first() { return (await statement.all()).results[0] || null; },
    async run() { const { stmt, args } = execute(); return stmt.run(...args); },
  };
  return statement;
};
const env = { DB: { prepare }, AUTH_SECRET: 'synthetic-test-secret', APP_URL: 'https://example.invalid' };
const first = await listUsersPage(env);
assert.equal(first.users.length, 50); assert.equal(first.total, 76); assert.equal(first.totalPages, 2);
assert.equal(first.users[0].id, 'user-075'); assert.equal(first.users[0].preferred_country, 'GR'); assert.equal(first.users[0].language, 'de');
assert.equal(first.users[0].language_mode, 'manual'); assert.equal(first.users[0].last_active_at, '2026-10-02T00:00:00.000Z');
const second = await listUsersPage(env, '2', '50'); assert.equal(second.users.length, 26);
assert.equal(new Set([...first.users, ...second.users].map(user => user.id)).size, 76);
assert.equal((await listUsersPage(env, '9999999999999', '100')).page, 1);
assert.equal((await listUsersPage(env, '-1', '9999')).pageSize, 50);
assert.equal((await listUsersPage(env, '2.5', '25')).page, 1);

const session = await createSession(env, 'user-000', 'synthetic-browser');
const cookie = 'evp_session=' + session.token;
const activity = id => db.prepare('SELECT last_active_at,last_login_at FROM users WHERE id=?').get(id);
const call = (path, method = 'GET', credentials = cookie, origin = env.APP_URL, body) => {
  const request = new Request(env.APP_URL + path, { method, headers: { ...(credentials ? { cookie: credentials } : {}), origin, 'content-type': 'application/json', 'user-agent': 'Synthetic Android test' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return handleAuth(request, env, new URL(request.url));
};
const old = '2026-10-01T00:00:00.000Z';
db.prepare('UPDATE users SET last_active_at=? WHERE id=?').run(old, 'user-000');
await getSession(env, new Request(env.APP_URL, { headers: { cookie } }));
assert.equal(activity('user-000').last_active_at, old, 'session checks never manufacture user activity');
assert.equal((await call('/api/activity', 'POST')).status, 200);
assert.notEqual(activity('user-000').last_active_at, old);
assert.equal(activity('user-000').last_login_at, '2026-10-02T00:00:00.000Z');
const active = activity('user-000').last_active_at;
await recordUserActivity(env, 'user-000'); assert.equal(activity('user-000').last_active_at, active, 'activity writes are throttled');
assert.equal(activity('user-001').last_active_at, '2026-10-02T00:00:00.000Z', 'other users are untouched');
assert.equal((await call('/api/activity', 'POST', '', env.APP_URL)).status, 401);
assert.equal((await call('/api/activity', 'POST', cookie, 'https://hostile.invalid')).status, 403);
const automatic = { automaticCountry: 'DE', automaticCountrySource: 'cloudflare', automaticLanguage: 'ro', automaticLanguageSource: 'browser_locale' };
assert.equal((await call('/api/activity', 'POST', cookie, env.APP_URL, automatic)).status, 200);
const observed = id => db.prepare('SELECT automatic_country,automatic_country_source,automatic_country_at,automatic_language,automatic_language_source,automatic_language_at FROM users WHERE id=?').get(id);
assert.equal(observed('user-000').automatic_country, 'DE');
assert.equal(observed('user-000').automatic_language, 'ro', 'country never determines the language');
assert.equal(observed('user-000').automatic_language_source, 'browser_locale');
assert.ok(Date.parse(observed('user-000').automatic_country_at));
assert.equal(observed('user-001').automatic_country, null, 'observations are scoped to the authenticated user');
const captured = observed('user-000');
await call('/api/activity', 'POST', cookie, env.APP_URL, automatic);
assert.deepEqual(observed('user-000'), captured, 'unchanged observations are throttled');
assert.equal((await call('/api/activity', 'POST', cookie, env.APP_URL, { ...automatic, automaticCountry: 'RO', automaticLanguage: 'de' })).status, 200);
assert.equal(observed('user-000').automatic_country, 'RO', 'changed resolutions update immediately within the throttle window');
assert.equal(observed('user-000').automatic_language, 'de');
const changed = observed('user-000');
assert.equal((await call('/api/activity', 'POST', cookie, env.APP_URL, { ...automatic, automaticLanguage: 'xx' })).status, 400);
assert.equal((await call('/api/activity', 'POST', cookie, env.APP_URL, { ...automatic, automaticCountry: 'XX' })).status, 400);
assert.equal((await call('/api/activity', 'POST', cookie, env.APP_URL, { ...automatic, automaticCountrySource: 'manual' })).status, 400);
assert.equal((await call('/api/activity', 'POST', cookie, env.APP_URL, null)).status, 200);
assert.deepEqual(observed('user-000'), changed, 'invalid and legacy payloads cannot erase a saved observation');
assert.equal((await call('/api/activity', 'POST', '', env.APP_URL, automatic)).status, 401);
assert.equal((await call('/api/activity', 'POST', cookie, 'https://hostile.invalid', automatic)).status, 403);
const manualSession = await createSession(env, 'user-075', 'synthetic-browser');
await call('/api/activity', 'POST', 'evp_session=' + manualSession.token, env.APP_URL, automatic);
const manualUser = (await listUsersPage(env)).users[0];
assert.equal(manualUser.preferred_country, 'GR'); assert.equal(manualUser.country_mode, 'manual');
assert.equal(manualUser.language, 'de'); assert.equal(manualUser.language_mode, 'manual');
assert.equal(manualUser.automatic_country, 'DE'); assert.equal(manualUser.automatic_language, 'ro');
const edgeRequest = new Request(env.APP_URL + '/api/activity', { method: 'POST', headers: { cookie, origin: env.APP_URL, 'content-type': 'application/json' }, body: JSON.stringify(automatic) });
Object.defineProperty(edgeRequest, 'cf', { value: { country: 'BG' } });
assert.equal((await handleAuth(edgeRequest, env, new URL(edgeRequest.url))).status, 200);
assert.equal(observed('user-000').automatic_country, 'BG', 'server-observed edge country takes priority');
assert.equal(observed('user-000').automatic_country_source, 'cloudflare');
assert.equal((await call('/api/admin/users')).status, 200);
assert.equal((await (await call('/api/admin/users')).json()).users.length, 50);
const ordinary = await createSession(env, 'user-001', 'synthetic-browser');
assert.equal((await call('/api/admin/users', 'GET', 'evp_session=' + ordinary.token)).status, 403);

const message = 'Error invoking postMessage: Java object is gone ' + 'full-message '.repeat(100);
const detail = 'iabjs://navigation_performance_logger_android:1\n' + 'full-stack\n'.repeat(300);
for (let i = 0; i < 225; i++) assert.equal(await logError(env, { source: 'client', message, detail }), true);
const errors = await listErrorsPage(env);
assert.equal(errors.total, 225); assert.equal(errors.errors.length, 50);
assert.equal(errors.errors[0].message, message); assert.equal(errors.errors[0].detail, detail);
assert.equal((await listErrorsPage(env, 5)).errors.length, 25, 'older errors beyond the former 200-row limit remain accessible');
assert.equal((await call('/api/admin/errors', 'GET', 'evp_session=' + ordinary.token)).status, 403);
const countBefore = db.prepare('SELECT COUNT(*) AS n FROM error_log').get().n;
assert.equal((await call('/api/errors', 'POST', '', env.APP_URL, { message: 'Script error.', detail: 'Original record' })).status, 200);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM error_log').get().n, countBefore + 1);
assert.match(db.prepare('SELECT detail FROM error_log ORDER BY id DESC LIMIT 1').get().detail, /Synthetic Android test/);

await destroySessionByToken(env, new Request(env.APP_URL, { headers: { cookie } }));
assert.equal(activity('user-000').last_active_at, active, 'logout retains activity');
assert.equal((await call('/api/activity', 'POST')).status, 401);
db.exec('DROP TABLE error_log');
const consoleError = console.error; let reported = null;
console.error = (...args) => { reported = args; };
try { assert.equal((await call('/api/errors', 'POST', '', env.APP_URL, { message: 'genuine failure' })).status, 503); assert.match(JSON.stringify(reported), /genuine failure/); }
finally { console.error = consoleError; db.close(); }
console.log('ok - admin pagination, automatic country/language persistence and manual preference preservation, activity ownership/throttling/logout, exception preservation and persistence failures');
