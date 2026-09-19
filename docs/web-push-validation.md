# Web Push implementation and validation — 2026-09-19

Release **2.56.0** is deployed to https://euro-funds.eu/. The production test
endpoint has created a real delivery that was accepted by the push provider on
its first attempt and acknowledged as displayed by the service worker. This is
server receipt evidence, not observation of an OS banner. Chrome automation was
stopped at the user's request; real click/navigation observation remains unverified.

## Implementation report

| Requested area | Implementation / evidence |
| --- | --- |
| 1. Files changed | UI: `PushNotificationsProvider`, `PushControls`, `PushActivationPrompt`, `AppChrome`, layout, profile, styles and session hook. Client: `app/services/push-client.js`. Server: `worker/notifications/{security,service,handlers}.js`, `worker.js`, `public/sw.js`, Wrangler configuration. Database: migrations 0029/0030. Tests: push client/UI/SW, SQLite integration, workerd runtime fixture. Release, build metadata, privacy/cookie text, dependency lock and documentation updated. |
| 2. Architecture | Existing cookie sessions, saved procedures and notification preferences feed a shared D1 queue and encrypted Web Push sender. Existing two-minute cron independently dispatches bounded batches. No existing push implementation or service worker was present to reuse. |
| 3. VAPID | All three required bindings are present. Private credential stays in a Worker secret. Its deployed format was a raw private scalar; normalization now happens only in server memory, followed by cryptographic key-pair validation. Public config returns configured status and public key only. No values are included in this report. |
| 4. Profile | Real permission, SW, PushManager and backend state determine status. Enable, disable, general test and saved-procedure/deadline test controls fit the existing section. Preference-only changes now activate the save bar, and preference save failures are handled. Email remains inactive. |
| 5. Test endpoint | Authenticated current-session subscription only; no arbitrary recipient/payload. Three tests/minute per user. Actual encryption, VAPID, provider request and service-worker receipts; UI distinguishes queued, accepted and displayed. Production accepted/displayed evidence is present. |
| 6. Welcome and scroll | Existing welcome completion and cookie/modal state gate the new prompt. It becomes eligible at 50% scroll; no automatic browser permission request. Not now only dismisses. |
| 7. Once per 24 hours | Atomic authenticated preference timestamp; localStorage fallback for anonymous users, Web Locks where available. Once per page. Denied/active/unsupported browsers are not prompted. Granted permission with missing subscription triggers repair. |
| 8. Service worker | Safe push parsing, display, same-origin destination validation, tab focus/navigation, subscription change handling, display/click receipts. No fetch/cache interception. Live `/sw.js` has root scope and no-cache and matches the tested source. |
| 9. Database | Seven additive push tables, indexes, uniqueness and cascade deletion; one prompt timestamp column. Migrations 0029 and 0030 applied to production; no project columns or funding data changed. Multiple devices, bounded retries, expiry, 404/410 removal, deduplication and preference checks implemented. |
| 10. Security | Ownership, session binding, CSRF, body/key validation, HTTPS provider allowlist, redirect rejection, rate limits and safe URLs tested. No widened CORS. Provider bodies and credential-bearing exception text are never logged. Private bindings are absent from browser assets. Unauthenticated production mutation endpoints return 401. |
| 11. Tests | Final `npm test` passes: **627 Vitest tests**, **11 SEO integration cases**, **9 push SQLite integration cases**, and **6 workerd runtime scenarios**. Runtime coverage reproduces and prevents the unsupported redirect-mode failure that Node-only tests missed. |
| 12. Build/typecheck/lint | Clean lockfile install and complete Next.js production build pass; Worker bundle/deployment pass. Project is JavaScript with no separate typecheck script. Targeted push-source lint passes. Repository-wide lint has the same 12 pre-existing errors and no newly introduced errors. |
| 13. Remaining issues | Real OS banner/click observation and browser walkthroughs were not completed because the user stopped Chrome checks. Automated navigation/onboarding tests pass; production display receipt is confirmed. Existing repository lint debt and 16 dependency advisories (4 moderate, 10 high, 2 critical) remain; no dependency security upgrade was folded into this feature. |
| 14. Deployment requirements | Already completed: migrations, protected binding presence checks, release entry, static build, Worker deployment and existing cron registration. No new service, scheduler or credential is required. Future environments require their own protected VAPID pair/subject and migrations before deployment; never copy production keys into source. |

## Production fixes and release evidence

The first production test exposed two configuration/runtime issues: the private
binding contained a raw VAPID scalar rather than serialized JWK, and the configured
Workers runtime rejected `redirect: 'error'`. Both are fixed. The sender now uses
manual redirect handling and treats all redirects as permanent failure, preserving
the restriction against forwarding push credentials to another destination.

Deployment version: `61a75c68-d059-410b-a274-575170d95e10`.
Frontend build: `20260919-192333-9247793f`.
Production configuration is valid; homepage, sitemap, version endpoint and service
worker returned HTTP 200. A fresh production user test was accepted on attempt 1
and produced a display receipt. The earlier failed test expired. At cleanup, no
delivery records remained (subscription removal cascades those records), so there
was no extra recovery delivery left to cancel. The successful receipt above was
observed before that cleanup; it is not inferred from the final empty queue.

Builds ran in an isolated local directory after a OneDrive dependency-install
stall. Source parity was checked; complete dependencies were restored to the
working repository. Temporary runtime/deployment diagnostic files are outside
the repository and are not part of the release. Runtime fixtures committed under
`test/` use ephemeral keys and controlled responses only.

See [architecture and operating instructions](web-push.md) for retention,
preferences, queue limits, configuration and production verification details.
