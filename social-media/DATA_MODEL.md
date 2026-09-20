# Live data model and query evidence

Verified 2026-09-20 against the production database. Repository references:
`wrangler.toml`, `worker/agent/mcp.js`, `app/lib/public-url.js`, migrations
0008, 0009, 0012, 0014, 0025 and 0026.

## Resources

| Resource | Binding / identity |
| --- | --- |
| Site Worker | evroproekti-dashboard |
| Account | 9c3fcd4952bcf0c295532e9884377d37 |
| D1 | DB / evroproekti-dashboard / d5f1bb40-3729-4c11-ae06-efbd4b5c9760 |
| Procedure KV | None configured; procedures are in D1 |
| Image KV (new) | IMAGES / EURO_FUNDS_SOCIAL_IMAGES / 9c1a7a254c4f466198c29c529bb72f52 |
| Image Worker (new) | euro-funds-social-images |

Public image origin: https://euro-funds-social-images.autumn-limit-8eff.workers.dev

## Tables and columns

| Entity | Table / relevant columns |
| --- | --- |
| Procedures | projects: id, country_code, name, status, deadline (raw description), deadline_date (structured date), budget (verbatim text), budget_amount_eur (not substituted for raw budget), eligible, official_url, link, original_language, source_id |
| Change timestamps | projects.last_updated, first_seen_at with first_seen fallback; project_change_history.changed_at |
| Change log | project_change_history: project_id, country_code, field_name, old_value, new_value, change_type, significance, source_url, run_id, changed_at |
| Official sources | funding_sources: id, country_code, name, authority_name, base_url, calls_url, source_language, enabled, verified, last_checked_at, last_success_at, updated_at |
| Source audits | source_audit_log: source_id, country_code, checked_at, status, evidence_url, result_summary |
| Daily runs | scheduled_sync_runs: id, task_key, started_at, completed_at, status, country range, records_inserted, records_updated, safe_summary |
| Daily snapshots | country_daily_statistics: snapshot_date, country_code, active_procedures, new_last_30_days, updated_last_30_days, last_successful_sync_at, publish_status |
| Public view | public_projects: public_slug, program_slug plus public procedure fields |
| Stable routes | public_routes: kind, entity_id, slug; public_route_aliases preserves old routes |
| Countries | countries: code, slug, english_name, native_name, default_language, enabled, coverage_status |
| Publishing history | social_posts: requested columns, topic stores image headline, changes_json stores used records, fetched_at, live overview and immutable composed content; unique run_date |
| Publishing mutex | social_publish_lock: id=1, owner, expires_at; 20-minute lease |

There is no universal projects.updated_at field. Timestamps mix date-only and
ISO/SQLite date-time strings, so the query normalizes with SQLite datetime().
NULL-aware MAX combines the latest update, first discovery and field-change log.
Checking last_seen_at would mistake a routine crawl for a meaningful update.

Greece is **GR** in D1 and URLs. The requested rotation uses EL; countries.json
maps EL to ISO/data code GR. No database country is renamed.

## Exact working change query

Execute through d1_database_query (or the connector's equivalent D1 query tool),
with the database ID above, parameter 1 = country data code, parameter 2 = current
UTC timestamp, parameter 3 = 7. Repeat with 14 then 30 only if fewer than two
records. One schema/query serves every country; no country-specific SQL branch.
The query returns all candidates ordered by change time; compose.py then ranks
new calls and nearest future deadlines and fits up to three complete records.

```sql
-- ?1 = database country (GR for rotation EL), ?2 = UTC as-of instant, ?3 = 7/14/30.
WITH change_times AS (
 SELECT project_id, MAX(datetime(changed_at)) AS changed_at
 FROM project_change_history WHERE country_code = ?1 GROUP BY project_id
), candidate AS (
 SELECT p.id, p.name AS title, p.country_code, p.status, p.deadline,
   p.deadline_date, p.budget, p.eligible AS applicants, p.original_language,
   p.official_url AS source_url, r.public_slug,
   COALESCE(datetime(p.first_seen_at),datetime(p.first_seen)) AS first_seen,
   MAX(COALESCE(datetime(p.last_updated),'0001-01-01'),
       COALESCE(datetime(p.first_seen_at),datetime(p.first_seen),'0001-01-01'),
       COALESCE(c.changed_at,'0001-01-01')) AS change_time
 FROM projects p JOIN public_projects r ON r.id = p.id
 LEFT JOIN change_times c ON c.project_id = p.id
 WHERE p.country_code = ?1
)
SELECT *, CASE WHEN first_seen >= datetime(?2, '-' || ?3 || ' days') THEN 1 ELSE 0 END AS is_new
FROM candidate
WHERE change_time >= datetime(?2, '-' || ?3 || ' days') AND change_time <= datetime(?2)
ORDER BY change_time DESC, id;
```

Canonical URL for each result is `https://euro-funds.eu/procedures/` plus the
percent-encoded `public_slug`, or percent-encoded `id` when no slug exists. This
matches `procedurePath()` in app/lib/public-url.js. The script adds it as `url`
after the SQL query; it does not transliterate or guess slugs.

## Exact live overview query

Count currently open/closing-soon records, excluding an explicitly elapsed
structured deadline; unknown dates remain counted. Do not use a historical daily
snapshot to claim a live total.

```sql
SELECT COUNT(*) AS open_count,
 MIN(CASE WHEN date(deadline_date)>=date(?2) THEN deadline_date END) AS nearest_deadline
FROM public_projects
WHERE country_code=?1 AND status IN ('open','closing_soon')
 AND (date(deadline_date) IS NULL OR date(deadline_date)>=date(?2));
```

Read history with:

```sql
SELECT * FROM social_posts ORDER BY run_at DESC,id DESC LIMIT 500 OFFSET ?1;
SELECT * FROM social_posts WHERE run_date=?1;
```

History is paginated until exhaustion; count all reserved dates, not platform
successes. Do not submit SQL mutations during discovery. Schema installation is
the separately authorized additive migration step. The publishers use atomic
conditional UPDATE ... RETURNING claims, not local checks alone.

## Site URLs and UI languages

Country list: `https://euro-funds.eu/procedures?country=BG` (substitute data code).
Detail example verified from current data:
`https://euro-funds.eu/procedures/bg-isun-bg14mfpr001-2-013`.
The site also supports stable country/program routes; the publisher uses the
existing canonical procedure route and country query parameter.
UI locales from app/lib/i18n/locales.js: bg, en, de, fr, es, it, ro, el, pl, cs, sk,
hu, nl, pt, tr, uk, sr, hr, sl, sv, da, fi, et, lv, lt (25). Maltese is not a UI
locale; the Malta post is English with a short Maltese greeting.

## Connector envelope for --changes

Call `run_daily.py --date YYYY-MM-DD --prepare` to determine the next country from
fresh cloud history. Make the queries above through the Cloudflare connector.
Write only their public data to the ignored social-media/changes.json:

```json
{
  "schema_version": 1,
  "country": "EL",
  "data_country": "GR",
  "source": "cloudflare-d1",
  "complete": true,
  "fetched_at": "<actual UTC ISO timestamp from this run>",
  "days": 14,
  "procedures": ["<all query result objects with canonical url added>"],
  "overview": {"open_count": "<live integer>", "nearest_deadline": "<live date or null>"}
}
```

The example shows types with placeholders, not real procedure data. Supply actual
objects/integers. Results must be complete (no unhandled connector pagination),
less than one hour old, from the correct country and time window. Do not add a
headline or generated narrative to facts. Never pass a history export as input.
Null values are preserved; when a connector forbids null SQL parameters, use SQL
NULL literals. The publisher still reads/writes history directly in Cloudflare.

## Verification evidence / transport distinction

The Cloudflare plugin was installed during this session. Its tools became
available after the initial Wrangler work. Both transports were then verified.
The following actual **Cloudflare connector** calls were performed:

- `mcp__cloudflare_api__search`: discovered D1 query/list, KV list and Worker list
  endpoint schemas from the current OpenAPI specification.
- `mcp__cloudflare_api__execute`: GET D1 databases, KV namespaces and Worker scripts;
  confirmed the configured database, namespace and both Workers.
- `mcp__cloudflare_api__execute`: one read-only changes.sql query per country
  (27 queries, window 30 days, timestamp 2026-09-20T13:06:14.564Z). All succeeded;
  every response reported rows_written=0. This verifies the identical country
  schema, including GR, without changing procedure records.
- `mcp__cloudflare_api__execute`: fresh BG 7-day change query and live overview;
  envelope timestamp 2026-09-20T13:07:02.994Z, two changed procedures and 34
  currently open procedures. This exact envelope was supplied to the required
  BG `--dry-run --changes social-media/changes.json` validation.
- `mcp__cloudflare_api__execute`: applied the exact idempotent migration 0037;
  all three statements succeeded, reporting zero writes because the tables and
  index had already been created through Wrangler.

Authenticated Wrangler 4.107.0 also performed these operations:

- `wrangler whoami`: authenticated account confirmed, no credentials printed.
- `wrangler d1 execute DB --remote --json --command ...`: PRAGMA countries, table
  presence, per-country counts/timestamps and BG structured records (read-only).
  An initial discovery query using name_en failed; PRAGMA established english_name.
- The exact changes.sql and overview SQL were executed by storage.py against all
  27 countries, extending the lookback only when necessary. No procedure rows
  were inserted or modified.
- `wrangler r2 bucket list`: account reports R2 disabled; KV chosen instead.
- `wrangler kv namespace create EURO_FUNDS_SOCIAL_IMAGES`: created the namespace.
- `wrangler d1 execute DB --remote --file migrations/0037_social_posts.sql`: created
  history and mutex tables. No social-post reservation was made during validation.
- `wrangler deploy --config social-media/wrangler.jsonc`: deployed the image server.
- `wrangler kv key put ... --remote --path ...`: uploaded a BG QA PNG and fetched
  identical bytes from its public HTTPS URL. Initial urllib default User-Agent
  received Cloudflare 1010; explicit EuroFundingSocialPublisher identification
  succeeded without any security-rule change.

The installed connector exposes the generic `search` and `execute` tools,
rather than individual d1_databases_list/d1_database_query tools. Use
`cloudflare.request({method:'POST', path:'/accounts/<account>/d1/database/<db>/query',
body:{sql,params}})` within execute after endpoint discovery. Explicitly select
account 9c3fcd4952bcf0c295532e9884377d37; do not use the other available account.

### Live composition results

| Rotation code | D1 code | Window days | Changes | Used | Facebook chars |
| --- | --- | ---: | ---: | ---: | ---: |
| DE | DE | 14 | 2 | 1 | 645 |
| ES | ES | 14 | 5 | 1 | 617 |
| PL | PL | 14 | 11 | 2 | 856 |
| IT | IT | 7 | 4 | 1 | 682 |
| SE | SE | 14 | 5 | 2 | 853 |
| RO | RO | 7 | 8 | 2 | 893 |
| NL | NL | 7 | 4 | 2 | 984 |
| PT | PT | 7 | 2 | 2 | 788 |
| CZ | CZ | 7 | 10 | 3 | 992 |
| FR | FR | 7 | 6 | 2 | 990 |
| EL | GR | 14 | 11 | 3 | 978 |
| HU | HU | 7 | 4 | 2 | 806 |
| DK | DK | 30 | 0 | 0 | 316 |
| BG | BG | 7 | 2 | 2 | 716 |
| IE | IE | 30 | 2 | 1 | 934 |
| SK | SK | 7 | 4 | 2 | 744 |
| FI | FI | 7 | 11 | 2 | 898 |
| HR | HR | 7 | 30 | 2 | 869 |
| AT | AT | 14 | 7 | 1 | 704 |
| LT | LT | 7 | 3 | 2 | 848 |
| BE | BE | 30 | 4 | 3 | 936 |
| SI | SI | 7 | 6 | 2 | 857 |
| LV | LV | 14 | 3 | 2 | 876 |
| LU | LU | 14 | 5 | 1 | 805 |
| EE | EE | 7 | 2 | 1 | 542 |
| CY | CY | 7 | 3 | 1 | 710 |
| MT | MT | 7 | 6 | 2 | 990 |

These are verification snapshots, not permanent counts or promises. DK exercised
the no-change evergreen path. All later posts must read the data again.
