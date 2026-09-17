# SEO release 2.55.0

Each procedure now has an immutable route in `public_routes`. The initial backfill preserves the record actually served at every existing procedure URL; colliding records receive separate digest-suffixed URLs. Programs are scoped by country, source and program name. No records were merged or deleted. Exact raw-ID links redirect to the registered page. Query-string drawer links remain supported, including links to a country different from the viewer's saved choice.

`public_projects` is a view over the existing table and route registry. The migration adds no columns to the 100-column projects table. New records are registered on the first public read; uniqueness constraints and deterministic allocation prevent concurrent requests from changing identities. Explicit, verified historical aliases can be entered in `public_route_aliases`.

The sitemap returns a complete canonical inventory or a logged 503 with Retry-After and no-store. There is no static or partial-success fallback. Country directories paginate at 100 procedures. The visible directory in the exported shell connects the homepage to the full catalog. Closed procedures remain accessible.

Only the Bulgarian shell has a complete initial server-rendered body. English/German client translations remain usable, but those shells are noindex and are not advertised in hreflang or the sitemap. Bulgarian share URLs retain Bulgarian social previews and canonicalize to unprefixed pages. Root social previews remain English. Genuine server-rendered translations can be added later as complete reciprocal locale sets.

The internal admin report checks registry coverage; it explicitly does not certify public-edge delivery. `node scripts/check-public-seo.mjs --full` checks the public edge, every sitemap destination, record identity, metadata uniqueness and HTML link reachability. The daily GitHub workflow runs this check and stores its report. Google indexing and Search Console fetch status are independent external checks.

## Deployment order

1. Apply `migrations/0026_public_routes.sql` before deploying the Worker.
2. For an existing deployment, export public ID/program/country/source inventory and crawl old procedure JSON-LD identifiers. Generate preservation SQL with `node scripts/backfill-public-routes.mjs inventory.json crawl.json backfill.sql`, inspect it, and apply it. Do not initialize an existing site's registry with guessed owners. The 17 September production backfill registered 1,443 procedures and 622 scoped programs.
3. Run `npm ci`, `npm test`, `npm run build`; no `out/sitemap.xml` should exist. Generated `out/` assets are deliberately excluded from Git.
4. Apply `migrations/0027_seo_release.sql`, deploy, and run the public-edge check above. Resubmit the unchanged `/sitemap.xml` URL in Search Console and verify a new successful read.

Rollback of application code does not require dropping the additive registry. Keep it to preserve permanent addresses. Do not remove routes when source content changes.

## Validation

The existing 612 tests and seven SQLite integration checks passed before release. Integration cases include more than 2,000 records, collision ownership, reserved names, exact mixed-case IDs, XML parsing, outage handling, pagination, structured-data escaping and the previously misleading coverage check.

No implementation can guarantee rankings or indexing of every submitted URL. Field Core Web Vitals require sufficient real-user data; a successful build or lab test is not field evidence.

## Production verification (17 September 2026)

- Full public-edge crawl: 2,114 sitemap URLs checked; 1,443 distinct procedure identities; all 1,443 reachable through initial HTML links from the homepage. No HTTP, canonical, noindex, identity, duplicate-title or duplicate-description errors. Crawl completed at 04:37:08 UTC.
- The original Bulgarian query-share link and an Italian query-share link while the viewer retained Bulgarian country selection both opened the correct drawer. The injected catalog remained present after React hydration.
- Mobile PageSpeed homepage: SEO 100, performance 70, accessibility 92, best practices 96; LCP 4.2 s, CLS 0.197. The reported shift concerns the translated overview summary. An anonymous profile-country request produces a 401 console entry. These are measured remaining dashboard improvements, not sitemap failures. Report: https://pagespeed.web.dev/analysis/https-euro-funds-eu/oltpn5rjb9?form_factor=mobile
- Mobile procedure template: SEO 100, performance 100, accessibility 95, best practices 100; LCP 0.8 s, CLS 0. No field CrUX data available for either tested template.
- Search Console accepted sitemap resubmission. It still displayed “Sitemap could not be read” with date 17 September and zero discovered pages during verification. This external acceptance gate remains open; a successful submission is not a successful read. Existing Cloudflare sitemap skip rules were inspected, not weakened.
- Google URL Inspection's live test at 07:46:09 Sofia time (04:46:09 UTC) reported “URL is available to Google”, crawl allowed and page fetch successful for `/sitemap.xml`. Correlated Worker logs recorded HTTP 200 for Google's robots request and both Google-InspectionTool sitemap requests. This proves live Google fetch access, but does not establish the historical cause or replace a successful Sitemaps-report read; that report still showed “Couldn't fetch” afterwards.
- At a verified 390 × 844 mobile viewport, the cross-country drawer and its permanent procedure page both fit the screen without horizontal overflow. The permanent-page link opened the correct Italian record.
