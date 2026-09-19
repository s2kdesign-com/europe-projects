# SEO recheck and Google sitemap diagnostics — 19 September 2026

## Confirmed findings

- The public XML sitemap returned 200 with the correct XML content type. A full public-edge crawl checked 2,119 canonical, indexable pages and reached all 1,447 procedure identities through internal links.
- Search Console's live inspection fetched the XML successfully on 19 September, while the Sitemaps report still showed `Couldn't fetch`, type `Unknown`, and zero discovered pages. These are different Google systems; successful live inspection does not prove sitemap processing succeeded.
- The admin overview was retaining historical checks for retired sample URLs and mixing them into current totals. Completed category audits now replace their previous sample sets; partial audits preserve other categories. Historical results remain available.
- Country directories were included in the procedure count. They now have their own classification. Cache details now come from the response instead of a hardcoded one-hour value.
- Long metadata appended internal record IDs and program slugs. Concise labels retain distinguishing context. Full-inventory checks cover 1,447 procedures and 623 programs with unique titles and descriptions; the longest generated title is 119 characters and description 190. These are editorial bounds, not Google indexing limits.
- Missing-official-source warnings ignored a valid fallback `link`. Audits now use the same validated source helper as public pages.
- 74 records had an elapsed deadline while still marked open. Some records describe several application windows. Public HTML, cards, detail drawers and agent markdown now warn that the announced deadline passed; records are not falsely closed without source verification.

## Google guidance and diagnostic endpoint

[Google's sitemap guide](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) supports UTF-8 text sitemaps containing one absolute URL per line. `/sitemap.txt` uses the exact same validated inventory as `/sitemap.xml`, including the same coverage checks, limits and retryable failure behavior. XML remains advertised in robots.txt. Public monitoring checks both formats and GET/HEAD delivery.

The text endpoint permits an independent submission without renaming canonical procedure URLs. It is a diagnostic alternative, not evidence that XML syntax caused the error.

[Google's Sitemaps report guidance](https://support.google.com/webmasters/answer/7451001) recommends checking access, robots, server errors and manual actions, then live-testing and resubmitting. No manual action, security issue or sitemap block was observed during this recheck. Sampled Cloudflare events alone cannot rule out every intermittent delivery problem. Do not weaken firewall rules without evidence of a blocked verified Google request.

[Google's title guidance](https://developers.google.com/search/docs/appearance/title-link) recommends concise descriptive titles, with no fixed character limit. Full source names remain visible in H1 headings and page content.

## Verification and remaining external work

- Local: 612 unit/component tests and 11 SQLite integration checks, including current-audit selection, XML/text parity, inventory coverage, route collisions and truthful elapsed-deadline handling.
- Production: rerun `node scripts/check-public-seo.mjs --full` after deployment and the admin full SEO audit. The public check is also scheduled daily in GitHub Actions.
- Google: inspect the submitted text sitemap's actual processing result. A submission confirmation alone is not successful processing or indexing. Preserve the XML submission for comparison.
- Data: verify elapsed deadlines and missing applicant/budget fields against official sources; never fill gaps with invented values merely to make an audit green.
