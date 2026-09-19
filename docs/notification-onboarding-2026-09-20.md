# Notification onboarding and public country alerts — 2.58.0

## Implementation

The anonymous activation button previously called `session.login('/profile')`;
the push client also rejected anonymous setup, and the API required a session.
All three gates now support the existing Web Push pipeline's public-country
scope. No second OAuth, subscription service, service worker, or sender was added.

- **Anonymous:** Enable requests browser permission directly from the click,
  reuses or creates the browser subscription, and registers a public country
  subscription without an account. The modal includes optional Google login,
  Not now, country selection, and success feedback.
- **Country:** the existing CountryProvider and 27-country registry are reused.
  An explicit notification choice takes precedence; an unresolved default-BG
  fallback is not silently accepted. The server validates the country code.
- **Authenticated:** Enable activates directly, with no Profile detour and no
  Google button. Profile reflects browser permission and backend registration.
- **Google:** existing authentication is unchanged. A 15-minute session intent
  preserves the original path, query, and fragment, and resumes the authenticated
  prompt. An existing public endpoint is promoted only with its owning browser's
  cookie proof; the subscription ID and useful country information are retained.
- **Premium:** existing entitlement, report history, daily report notifications,
  saved-procedure changes, deadlines, reminder days, and email preferences remain.
  The existing Profile preferences now include an optional daily cap of 1, 3,
  10, or all selected notifications. The server enforces this only for valid
  Premium entitlement. One event counts once across devices and retries; test
  notifications are exempt. Excess eligible events defer to the next UTC day,
  subject to their original expiration and current authorization/preferences.

## Public delivery and security

Public subscriptions use nullable user/session fields in the existing table and
an explicit `public_country` scope. A Secure, HttpOnly, SameSite=Lax host cookie
proves ownership; only its SHA-256 hash is stored. No fake account or raw IP is
created. Same-origin mutation checks, bounded JSON, existing endpoint/key/VAPID
validation, rate limits, receipt capabilities, stale cleanup, and safe same-origin
notification click navigation apply to the public flow.

The existing scheduled dispatcher prepares one country summary after 08:00 UTC,
covering newly detected procedures during the previous completed UTC day. Counts
come from canonical `public_projects`: `first_seen` for new procedures and
`open`/`closing_soon` for currently open procedures. The payload contains only
country, date, aggregate counts, and `/procedures/countries/<code>`.

No summary is created when the new count is zero. Each run advances a bounded
100-subscription country batch, using the existing delivery queue and sender.
Unique event and browser/day delivery keys prevent duplicate queueing, including
country changes. Registrations made during the current UTC day are excluded from
that day's batch; the summary itself describes the whole previous day, not each
subscriber's individual consent timestamp. Public subscriptions cannot receive
saved-procedure, private profile, or Premium report payloads. Promotion and country
changes revoke delivery/receipt eligibility for an old public scope or country.

## Migration and production evidence

Migration `0033_public_country_push.sql` backs up and rebuilds the existing push
foreign-key graph in child-first order, then restores its records and adds the
public scheduling/rate-limit and Premium allowance tables. This avoids losing
children through DROP TABLE cascades. Migration `0034_public_push_release.sql`
records the release in the existing changelog.

Production migration preserved **2 subscriptions, 7 notification events, and
5 delivery records**. `PRAGMA foreign_key_check` returned **zero violations**.
Worker deployment succeeded with version ID
`e6ee15ab-9b4c-4eac-b684-7c5218459df0`; production reports application **2.58.0**.

Live API validation confirmed:

- VAPID is configured; visitor setup returns the Secure/HttpOnly cookie.
- An anonymous RO subscription registers, reports active public-country status,
  and retains its ID on repeated registration.
- Anonymous personal-test access returns 401; injected privilege fields return
  400. Anonymous Premium-report and admin-plan requests return 401.
- The public Romanian procedures destination returns 200.
- The generated validation subscription was deleted through its owner cookie;
  subsequent status was inactive. No external push was sent by this probe.

No credentials, cookies, push endpoints, or subscription keys are included here.

## Validation

Checks ran in an isolated local copy with source parity to this change, avoiding
the workspace's OneDrive dependency-install problems.

| Check | Result |
| --- | --- |
| `npm test` — Vitest | 637 unit/UI tests passed across 32 files |
| SEO integration | 11 scenarios passed |
| Push integration | 17 scenarios passed |
| Billing integration | 15 scenarios passed |
| Workers push runtime | 12 personal/public sender cases passed; no external delivery |
| Workers Stripe runtime | 2 raw-signature cases passed |
| `npm run build` | Production static export passed; deployment rebuilt successfully |
| `npm run lint` | Same 12 pre-existing errors; no new task errors |
| Typecheck | JavaScript project; no typecheck script or TypeScript configuration |

The lint baseline comprises three conditional-hook errors in AiModelsTab, one
hook-in-callback error in LanguageRegionSection, and eight existing Next Link
errors across Admin, AccountHeader, AppHeader, how-ai-works, login, and Profile.
Existing warnings remain.

New coverage includes anonymous activation without login, required country choice,
authenticated button visibility, success feedback, Google return context and
onboarding resumption, browser permission states, existing scroll/throttle rules,
actual client-to-API-to-SQLite registration and promotion, ownership/scope checks,
country aggregation and empty-day suppression, daily deduplication, country-change
cancellation, populated migration preservation/cascades, service-worker endpoint
rotation, and Premium limits across devices/retries. Existing billing and Premium
report regression tests remain passing. Push integration was also rerun after
making date fixtures relative to the test date.

**Browser validation boundary:** per the user's instruction not to check Chrome,
no real Chrome permission dialog, Google consent journey, or physical-device
notification display/click was exercised. UI and client integration tests use
browser/auth fixtures; the API probe and Workers runtime checks are separate
evidence, not a claim of real-browser end-to-end success.

## References

- [Cloudflare D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- [Cloudflare D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)
