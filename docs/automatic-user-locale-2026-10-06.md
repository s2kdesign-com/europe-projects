# Automatic country and language observations

The Users table displays the last observed automatic country and language by
name, with an Automatic label. Manual preferences retain precedence. Default
fallbacks are explicitly labelled Automatic · Default; an account that has not
yet visited the updated site has no guessed/backfilled automatic value.

The browser uses the existing resolvers: Cloudflare country, then supported
browser-region, then BG for automatic country; first supported device language,
then the existing en/bg fallback for automatic language. Language is independent
of country. URL and manual overrides are excluded from automatic observations.
The server prefers the current request's supported Cloudflare country.

Authenticated foreground activity saves the resolution, source and server
timestamp in six separate users columns. It does not modify profile preferences,
notification preferences or manually selected modes. Source/code validation,
same-origin checks and session ownership apply. Repeated unchanged observations
are throttled to one minute; changed resolutions update immediately, including
changes during an in-flight report. Persistence failures use the existing error
reporting. No raw IP, precise location or complete browser-language list is stored.

`migrations/0046_automatic_user_locale.sql` adds nullable columns without a
backfill. It was applied to production through the authenticated Cloudflare
connector before this code push; do not repeat the ALTERs there. Existing automatic
accounts populate on their next signed-in foreground visit. The table's timestamp
tooltip shows when the resolution was last observed, not a claim of current
physical location for an offline user.

Validation covers real SQLite persistence, ownership, CSRF, validation, source
priority, throttling, manual preference preservation and legacy empty activity
requests; browser provider resolution and fallback; in-flight changes; and
localized/responsive admin table display, including an unobserved account.

Validation passed: 39 unit files / 721 tests, real SQLite admin and billing
integration, workerd runtime checks, 25 admin viewport/locale layouts, lint,
Next static production export, and Wrangler Worker/assets dry-run from an
isolated snapshot of the staged source. Unrelated pending release/social edits
were excluded. Existing unrelated lint/CSS warnings remain.

The production schema check preserved 77 users, 77 profiles and 77 preferences;
email/role/country/language aggregate lengths (1727/309/24/154), 12 manual country
choices and 8 manual language choices were unchanged. All automatic observations
start null; foreign-key check returned no violations. No unrelated pending
migrations were applied. This records schema and local validation, not a verified
post-push production UI test.
