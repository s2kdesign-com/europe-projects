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

## Chrome transport verification — 2026-09-20 (v2.60.1)

- 33 Python tests passed, including default preparation without API calls,
  wrong-author refusal, attempt ownership, duplicate claims, ambiguous-delivery
  blocking and restoring the saved PNG for browser retries.
- Chrome extension session confirmed Facebook's top-right profile selector is
  already on **Euro-Funds.eu - EU Funding & Grants**. Its Create post dialog
  showed that author and Public audience.
- Opened LinkedIn directly and followed the Euro-Funds **View as admin** control
  into organization **145200865**. Its company Create post dialog showed
  **Euro-Funds | EU Funding & Grants**, Post to Anyone, and Add media.
- Empty composers were inspected without submitting posts. Actual image upload,
  Post click and permalink capture remain to be exercised during a publishing run.
- The saved daily task uses the Chrome connector and the browser claim/record
  commands. It no longer requires Facebook/LinkedIn API credentials.
- Its existing PAUSED status and daily 10:00 Europe/Sofia schedule were preserved.
  The updated prompt was saved to automation `euro-funding-daily-social-publishing`.
- Chrome must be running, connected and signed in when the local task executes.
  The OpenAI key shared in chat was not saved or used. Missing runtime image
  credentials still use the tested branded gradient fallback.

Copy surrounding the records is localized; procedure titles and structured
fields remain exactly as stored, including any source-language/Bulgarian notes.
The task must not invent a translation of a deadline, budget or eligibility rule.
Some live records have very long narrative budget fields; the composer selects
whole records that fit and reports how many were omitted. If none can fit, it
requires editorial action rather than publishing misleading truncated facts.

Browser sessions may require the owner to sign in again. Ambiguous delivery
requires reconciliation; never repeat a Post click solely because the UI timed out.
