# Web Push notifications

Version 2.56.0 extends the existing D1 preferences, cookie-session authentication,
saved procedures, Profile and welcome flow. The audit found no previous push
sender, subscriptions, notification producer or service worker. Email delivery
remains inactive; its existing preference is retained without routing email opt-in
to push or sending mail.

## Configuration and deployment

Configure each environment separately using Cloudflare's protected configuration:

| Binding | Location | Exposure |
| --- | --- | --- |
| `WEB_PUSH_VAPID_PRIVATE_JWK` | Worker secret, JSON P-256 private JWK | Server only |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Worker variable or secret, base64url uncompressed P-256 | Only public config endpoint |
| `WEB_PUSH_VAPID_SUBJECT` | Worker variable or secret, HTTPS contact URL or mailto | Server only |

The private binding also accepts a generator's base64url 32-byte private scalar.
It is normalized to JWK in server memory and cryptographically checked against
the configured public key; a mismatched pair still fails closed. JSON JWK is the
preferred configuration format. Safe diagnostic stage codes are logged for invalid
configuration; no key, subject, parser exception or provider body is logged.

Never paste actual values in repository files, logs, examples or issue reports.
`keep_vars = true` preserves dashboard-managed variables on deployment. Private
key pairing is verified with Web Crypto before use. Missing/invalid configuration
disables push without affecting the website. There is no separate staging config;
local/staging credentials must be distinct and injected at runtime, never copied
from production. No notification permission is requested automatically.

Apply migrations `0029_web_push.sql` and `0030_web_push_release.sql` once, before
deploying the Worker. Use the project's D1 migration workflow; existing deployments
may have migrations applied manually, so inspect schema/history before bulk apply.
Build with `npm ci && npm run build`, validate with `npm test` and `npm run lint`,
then deploy with `npx wrangler deploy`. Suppress/redact VAPID binding values in CLI
output and set `WRANGLER_WRITE_LOGS=false` to disable raw CLI log files. Check configuration presence only. Existing cron (`*/2 * * * *`) dispatches
push independently of the AI job; no external scheduler or new Cloudflare binding.

## Architecture and security

`app/services/push-client.js` checks HTTPS, Notification permission, service worker,
PushManager and stored ownership. `PushNotificationsProvider` shares live status.
Profile controls opt in, disable the current browser and send server-side tests.
Granted permission with missing/stale subscription repairs automatically, except
after an explicit browser opt-out. An unrelated root service worker is never
replaced silently. Push activation is independent of analytics consent.

`worker/notifications/` contains input validation, session-only routes, a shared
encrypted Web Push sender and a bounded scheduler. `web-push` generates RFC8291
aes128gcm encrypted requests and VAPID signatures; Workers fetch sends them.
Outbound requests use `redirect: 'manual'` and reject every 3xx response. The
configured workerd runtime rejects `redirect: 'error'` before sending; the runtime
regression test covers this difference from Node's fetch implementation. Manual
handling also follows Cloudflare's [redirect security guidance](https://developers.cloudflare.com/workers/runtime-apis/request/#properties).
Private credentials never appear in API responses, browser bundles or diagnostics.
No global mutable VAPID config is used. Error codes are fixed and provider response
bodies are neither read nor logged. Subscription credentials are stored only in D1
and are never returned to clients. No additional raw IP/device fingerprint is stored.

Public `GET /api/notifications/config` returns configured status and public key only.
All other endpoints require the existing HttpOnly cookie session, not agent bearer
tokens. Mutations require matching Origin/Referer and reject cross-site requests.
No CORS is added. JSON bodies are limited to 8 KiB. Subscription public keys must
be valid P-256 points and auth secrets 16 bytes. Push destinations are HTTPS allowlisted
browser services (FCM, Mozilla, Apple, Windows); redirects are forbidden. Additional
browser providers require explicit review before extending the allowlist.

* `POST/DELETE subscription`: register/update or remove the current user's endpoint.
* `POST subscription/status`: compare endpoint hash, current session, key version and expiry.
* `POST prompt`: atomic server claim, at most once in a rolling 24-hour period.
* `POST test`: current session's stored subscription only, max 3/minute per user.
  A client cannot supply an arbitrary endpoint, recipient or payload. General test
  is explicitly requested and independent of automatic-event preferences. Change
  and deadline tests select the user's own saved procedure and honor the same
  production preference/deadline gate, without changing source data.
* `POST receipt`: opaque token hash + owner + session check; verifies preferences
  again before display and records browser display/click acknowledgement.
* `GET delivery/:id`: current user's safe delivery state only.

## Lifecycle and delivery

Up to 10 devices per user; endpoints are unique and cannot transfer between users.
Subscriptions bind to the 30-day login session. Logout removes only that session's
subscriptions through D1 foreign keys; browser unsubscribe is best effort. Account
deletion cascades push records. Expired sessions/subscriptions are pruned by cron.
404/410 removes the endpoint and records a 7-day hash tombstone so browser repair
rotates it. VAPID key changes trigger renewal. Registration is limited to 20/10 minutes.

Saved content fingerprints establish an opt-in baseline, then compare meaningful
fields rather than update timestamps. Disabled preferences advance the baseline
without accumulating old change alerts. Deadline reminders require a valid date,
an open/closing-soon procedure and 0..60 reminder days, including an existing
per-procedure override when enabled. Dates use UTC calendar days. Archived/removed
saved procedures are excluded. Email preference never enables either push type.

Atomic event + per-device fan-out deduplicates changes by revision and deadlines
by saved procedure/date. The scheduler scans up to 100 saved records per run with
a persistent round-robin cursor and 20-second scan budget. It sends up to 12 queued
deliveries per run, four in parallel. These limits bound Worker/D1 usage; large
queues take additional two-minute cycles. A dispatch lease prevents overlapping
scans. Delivery leases and at most 3 attempts handle transient errors; permanent
4xx (except 429) fail without retry. Payload TTL is five minutes for tests and one
day for automatic alerts. Delivery rechecks preferences, session and expiry.

Crash-safe queues cannot promise exactly-once external delivery. Stable notification
tags suppress duplicate visible notifications. Event/delivery records expire 30 days
after notification expiry; cleanup is bounded to 500 per cron run.

`public/sw.js` has no fetch/cache handler. It safely parses push payloads, gates
display through authenticated receipts, displays a notification, and acknowledges
display. If receipt verification is unreachable, only a generic message is shown,
never private procedure text. Clicks sanitize same-origin destinations, avoid API
and admin routes and focus/navigate an existing tab where possible. Subscription
change attempts renewal, with page-load repair as fallback.

## Prompt and verification

The existing AppChrome welcome completion and cookie/modal state gate the prompt.
At >=50% scroll, it claims once per page and once per 24 hours. Authenticated users
use an atomic D1 preference timestamp; anonymous users use localStorage (Web Locks
when available). Persistence failures suppress anonymous prompts. Denied, granted,
unsupported and already-active browsers are never nagged. Not now never calls the
permission API. Clearing storage can reset anonymous throttling; authenticated
server throttling persists across devices.

Automated tests cover real SQLite schema/ownership/cascades, Web Push encryption
decryption and JWT verification with ephemeral keys, preference generation/delivery,
rate limits, retries, expiry, prompt/UI lifecycle and SW navigation. These tests
use controlled HTTP responses and do not constitute production delivery evidence.
`test/push-runtime.mjs` also bundles the actual sender and runs it in workerd with
ephemeral keys, covering both accepted responses and refused redirects for JWK
and raw-scalar configuration. It never contacts an external push endpoint.

For production, use Profile enable -> real permission -> server test -> browser
display acknowledgement -> click -> internal destination. Test changes with the
saved preference disabled and saved, then enabled and saved. Deadline tests also
require an actual saved procedure inside the configured reminder window. Never
forge funding changes or deadlines for verification. A push provider 2xx proves
acceptance only; a service worker acknowledgement proves showNotification resolved,
not that a person saw an OS banner. OS visibility/clicks require real observation.

References: [Push subscription](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe),
[notification display](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification),
[web-push](https://github.com/web-push-libs/web-push),
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
