# Verification — 2026-09-20

## Passed

- 29 Python unittest checks: BG/EL/PL fixtures, all 27 countries, language rotation,
  2:1 cadence, distinct scenes/headlines, fresh snapshots, exact structured fields,
  fitting complete records, evergreen, stale/cross-country rejection, cloud locks,
  per-platform claims, crash/timeout handling, redaction, API payloads, null binds,
  model fallback, dry-run isolation and Unicode image rendering.
- Four Node tests for the public image Worker: GET/HEAD streaming, write/path
  rejection, missing keys and safe KV failure responses.
- `npm run lint`: exit 0; ten existing React hook/accessibility warnings outside
  this change. Focused ESLint on the image Worker and release metadata: no findings.
  No repository typecheck script exists. Wrangler validated the new Worker bundle
  and generated its binding declarations; Python compilation also passed.
- Real production D1 reads through authenticated Wrangler for all 27 countries;
  every country produced bounded-length copy. Denmark exercised evergreen.
- Cloudflare connector search/execute: resource inventory, one read-only 30-day
  query per country (27 successful queries, zero writes), fresh BG snapshot and
  overview, and idempotent application of the social history migration.
- `run_daily.py --date 2026-09-20 --dry-run --country BG --changes social-media/changes.json`
  completed using the connector's fresh two-procedure snapshot. Both composed
  posts were printed: Facebook 716 characters, LinkedIn 775 characters. No post,
  image upload, history row or paid image request was created by the dry-run.
- BG, EL, PL and DE PNG previews generated with `--no-ai` and visually inspected.
  Noto Sans renders Cyrillic, Greek and Latin diacritics without clipping.
- Image namespace and read-only media Worker deployed. A QA PNG was uploaded
  separately to KV and fetched byte-for-byte from its public HTTPS URL:
  https://euro-funds-social-images.autumn-limit-8eff.workers.dev/2026-09-20/BG-99b9daa9c5a249ffbbf3bda2a8cb74d3.png
- Public country-list and canonical BG detail URLs returned live Markdown.
- The production D1 mutex acquired/released successfully. Afterwards both the
  mutex table and social_posts contained zero rows: validation did not consume
  rotation or cadence.
- Migrations 0037 and 0038 applied; the required 2.60.0 D1 changelog record exists.
  Website release metadata was updated locally; the main website was not deployed.

## Activation state and limits

The Codex task `Euro-Funding daily social publishing` is saved **PAUSED**, daily
at 10:00 in the app's Europe/Sofia timezone. Automation ID:
`euro-funding-daily-social-publishing`. Its exact prompt is in
`SCHEDULED_PROMPT.md`. It is a desktop/local scheduled task; a cloud runner must
be configured separately with the same repository, prompt and environment.

Facebook Page ID/token and LinkedIn token/version were not supplied in the process
environment. Live publishing, organization permissions, API-version access and
token validity are therefore unverified. No posts have been sent. The OpenAI key
shared in chat was not saved or committed; supply a replacement through the
runtime secret manager. Paid image generation was not exercised; model-error and
gradient fallback paths were tested with offline fixtures.

Copy surrounding the records is localized; procedure titles and structured
fields remain exactly as stored, including any source-language/Bulgarian notes.
The task must not invent a translation of a deadline, budget or eligibility rule.
Some live records have very long narrative budget fields; the composer selects
whole records that fit and reports how many were omitted. If none can fit, it
requires editorial action rather than publishing misleading truncated facts.

Tokens require renewal/reauthorization when their provider expires or revokes
them. Ambiguous post delivery requires reconciliation; blindly retrying a timed
out POST cannot guarantee exactly-once delivery on these remote APIs.
