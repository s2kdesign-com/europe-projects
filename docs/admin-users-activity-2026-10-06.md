# Users administration, activity and exception reporting

Users are paginated on the server with 50 rows by default and 25/50/100 page
sizes. Ordering is registration time descending, then user ID descending, so
users sharing a registration timestamp have stable page boundaries. The count
and page range refer to all users. Roles retain the existing administrator-only
mutation and bootstrap-administrator protection. Role controls have a readable
minimum width; user/email share a cell; subscription, plan, period and invoice
information remains available in an accessible disclosure.

Country and language come from saved profile/preferences. Country is the funding
country preference, not a claim about residence. Automatic language is explicitly
shown as automatic rather than treating the default preference as the user's
chosen device language. Names and timestamps use the administrator's UI locale.

`users.last_active_at` persists across logout. Sign-in and `/api/activity` update
it using server time, scoped to the authenticated user, at most once a minute.
The endpoint requires a browser session and same-origin POST; bearer tokens
cannot write activity. The global reporter records visible navigation, return
to the foreground and trusted pointer/keyboard/wheel/touch interactions. There
is no idle heartbeat. Session validation, notification polls and exception
reporting do not update user activity. Previous login timestamps supply the
historical baseline; earlier browsing activity cannot be reconstructed.

## Exception audit and corrections

The live audit on 6 October 2026 initially found 348 exceptions:

- 214 Android native bridge `Java object is gone` errors and 17 native bridge
  Java invocation exceptions. Other syntax errors also identify `iabjs://`
  injected code. This bridge is outside the repository. Fixing its lifecycle
  requires the browser application's native code; this change does not claim
  to have repaired that external bridge.
- 48 opaque `Script error.` records. Their original missing stack cannot be
  reconstructed. The analytics script supports CORS (`Access-Control-Allow-Origin:
  *`, checked in this run), so anonymous cross-origin loading enables fuller
  diagnostics for future errors from that script.
- 51 `Object Not Found Matching Id` errors have no original diagnostic stack.
  Their owner cannot be established from those records alone. No ownership is
  inferred solely from their message.
- 9 Webpack module-factory errors from 20 September. Current bundle navigation
  passed without reproducing them. Their traces are consistent with mixed
  deployment assets. Wrangler previously bypassed build-identifier generation;
  it now runs `npm run build`. Next sends the fresh deployment identifier on
  navigation requests; the Worker rejects stale RSC requests (including tabs
  opened before identifiers were configured) before new chunks
  enter an old runtime, using Next's full-document navigation fallback. A real
  exported-bundle regression simulates a deployment change.
- MetaMask records explicitly point at a browser-extension script. Other
  `window.ethereum`/`window.webkit` errors have insufficient origin evidence.
  Extension and native bridge records remain visible with their original text.
- One server-side D1 reset/timeout during procedure lookup, dated 10 August.
  Procedure lookup reads now have bounded transient-error retries with backoff.
  Each failed attempt remains recorded, including attempts followed by success.
  Permanent SQL failures are not retried; exhausted failures still propagate.

There are no exception allowlists, suppression, deduplication or automatic
deletions. The old 12-event lifetime cap is removed. Failed delivery remains in
an in-memory queue and retries; failed database persistence returns 503 instead
of falsely acknowledging success. If database logging fails, the original
redacted exception and logging failure are also emitted to Worker logs.
Original messages/stacks are no longer
silently truncated. Existing secret redaction remains. New reports include build,
page visibility and server-observed user-agent context. Resource-load failures
are also captured. Explicit administrator-requested clear still requires the
existing confirmation.

The exception list is paginated, including records beyond the previous 200-row
limit. Full messages wrap; details are keyboard accessible. Failed load,
refresh, role save and clear operations show an alert and preserve existing
rows instead of showing an empty list or claiming success.

## Production schema

`migrations/0045_user_activity.sql` was applied through the authenticated
Cloudflare connector before the code push. Do not repeat its `ALTER TABLE` on
this production database. Unrelated pending social migrations were not applied.

Before and after the migration: 76 users; aggregate login/registration/email/role
lengths were unchanged (1824/1824/1700/305). All 76 activity baselines matched
their login timestamps. All 349 exceptions present at migration time were
preserved: ID sum 63169 and combined diagnostic text length 108028 before and
after. Foreign-key check returned no violations.

## Validation

The staged source was copied to a temporary checkout, excluding unrelated
uncommitted social/release changes. This also avoids OneDrive's `EINVAL readlink`
failure while rebuilding `.next` in the original checkout.

- Unit suite: 38 files, 715 tests passed.
- Admin integration: real SQLite migration, 76-user page boundaries, stable
  ordering, saved country/language, admin/CSRF/session gates, activity ownership,
  throttling and logout retention, 225 full-message exception records and 503
  persistence failure with the original exception in Worker logs passed.
- Existing SEO, billing, notification integration and workerd runtime tests passed.
- Admin browser fixture: 25 viewport/locale combinations, 50-row default,
  page-size/navigation, role-save failure, refresh failure, clear failure and
  keyboard-accessible original error details passed.
- Shared profile checks: 150 language/viewport and 100 drawer layouts passed.
- Real exported Next bundle: 100 layouts plus direct procedure navigation,
  history, sharing, catalog failure, no-JavaScript fallback and a simulated
  deployment change passed. Stale RSC was rejected; Next performed a fresh
  document navigation without a bundle exception.
- Production export and Wrangler Worker/assets dry run passed in the isolated
  checkout. The final Worker bundle includes the logging-persistence fallback.
- Lint and staged diff checks passed. Existing lint and CSS compatibility
  warnings remain in unrelated files.

The code push and a deployment are distinct; these checks do not claim an
authenticated production UI test or a newly deployed Worker.
The Android native browser lifecycle requires external application access and
was not hardware-verified in this run.
