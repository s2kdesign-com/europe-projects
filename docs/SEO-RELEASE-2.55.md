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
