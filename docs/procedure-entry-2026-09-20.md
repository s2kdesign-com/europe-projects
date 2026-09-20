# Permanent procedure entry — 2.61.0

Public `/procedures/:slug` URLs previously returned an independent Worker HTML template. Ordinary card clicks intercepted that URL and opened `ProjectDrawer`, so direct visits and new tabs had a different design and fewer actions.

The Worker now resolves the existing immutable route and composes its public content and metadata into the exported `/procedures` shell. The Worker-owned `procedure-bootstrap` island contains safely serialized procedure/documents and a readable fallback using the shared drawer CSS. Hydration opens the existing `ProjectDrawer` and removes the fallback only when the interactive detail is ready. Country preferences and interface language remain separate, and a failed background catalog request cannot hide the requested procedure.

The initial HTML retains procedure content, document/source links, canonical, Open Graph, Twitter and JSON-LD metadata. Both HTML head and Next's serialized metadata are updated: changing only the head allowed hydration to reinsert the listing canonical. The production-bundle regression is intentionally part of CI to detect changes in this static-export contract during Next upgrades.

Card actions and copied links use the registered permanent route. Legacy `?id=` entry remains supported. Native history stores the selection and return URL, preserves Next's own state, and restores list filters on close. Initial URL normalization uses replacement rather than adding a spurious history entry. Automatic welcome, cookie, update and notification prompts wait until the procedure is closed; analytics consent defaults are unchanged.

## Verification

- `npm test`: 702 Vitest tests plus SEO, notification, billing and workerd integration checks.
- `npm run lint`: passes with existing warnings.
- `npm run build`: production static export succeeds.
- `npm run test:procedure-entry`: actual exported Next bundle and Worker HTML composition; direct/tracking URLs, hydration metadata, cross-country entry, reload, new tabs, legacy IDs, close/history/filter restoration, failing catalog, no JavaScript, Copy link, Save, calendar download and keyboard focus. 100 layouts across all 25 languages.
- `npm run test:layout`: 150 page layouts, 100 drawer layouts and 25 interaction sets.
- `wrangler deploy --dry-run`: Worker and assets bundle successfully.

Browser fixtures use deterministic public procedure data and simulated translation responses. Live validation is recorded separately; fixture checks do not establish the quality of machine-translated source material.

Release migration `0040_procedure_entry_release.sql` inserts the version's changelog entry idempotently. No procedure records, public slugs, authentication or payment settings are modified by the migration.
