# Premium, notification time and responsive procedures — 2.59.0

## Changes

| Area | Implementation |
| --- | --- |
| Profile preferences | `DailyNotificationTime.jsx` adds an accessible 00:00–23:00 selector to the existing notification section and Profile save flow. |
| Persistence | Migration 0035 adds `user_preferences.daily_notification_hour`, integer 0–23, default 10. Invalid writes return 400; omitted values preserve the saved hour. Runtime helpers fall back to 10 for invalid/missing data. |
| Timezones | The existing 27-country registry now carries an IANA civil timezone. Profile displays the timezone explicitly. The funding country, rather than UI language, browser timezone or AI schedule, determines the clock. |
| Scheduling | `worker/billing/reports.js` creates one report per user/local date and queues its notification only after the saved local hour. The existing two-minute cron, model generation, leases and delivery pipeline remain in use. |
| Delivery | `worker/notifications/service.js` checks the latest saved hour again before sending a queued report. Deferral changes only that delivery and consumes no provider retry. |
| Premium selector | `PremiumPanel.jsx` renders configured monthly/yearly prices, billing intervals, benefits, keyboard-accessible radios, visible selection and conditional annual savings. Existing Premium users see their authoritative status and management/report controls. |
| Pricing | `annualSavings()` uses configured integer minor units: saving = 12 × monthly − annual; percentage = saving / (12 × monthly) × 100. It requires comparable, unambiguous same-currency plans and positive savings. No discount is shown for missing, equal, more expensive or incompatible pricing. |
| Procedure actions | `ProjectCard.jsx` reuses `ProjectActions.jsx`; grid, attention and recommendation cards share paired Save/Compare buttons with wrapping labels, independent callbacks and canonical detail links. |
| Responsive styles | `globals.css` constrains card/grid widths, metadata, badges and translated controls. Drawer buttons wrap; its four grid children now have four rows. `site.css` styles Premium plans and the local-time field. |
| Localization | 54 labels have offline translations for all 25 supported UI languages, integrated into `useUiTranslate`. Brand “Premium” remains unchanged. Currency/percentage formatting uses the active locale. Dynamic label changes also invalidate the existing translation hook correctly. |
| Lint cleanup | Existing helper names incorrectly classified as hooks were renamed/aliased. Eight internal root links now use Next Link. No lint rules were disabled. |

Country clocks represent the named country timezone displayed in Profile (for
example Europe/Madrid for Spain and Europe/Lisbon for Portugal); this change does
not introduce a separate regional or user-entered timezone selector. IANA/Intl
rules account for summer/winter offsets. A skipped spring hour becomes eligible
at the next existing local hour; repeated autumn hours retain the same daily
deduplication key.

Reports prepare ahead of the delivery hour. Delivery begins on an eligible cron
run once the report is ready; the UI explains that a late report is notified when
ready. Device connectivity and browser delivery can introduce further delay.
Changing the hour does not resend an already-notified report. Existing Premium
volume limits, entitlement checks, report history, notification types, reminders,
anonymous public country summaries, OAuth, Stripe Checkout and Customer Portal
remain in place.

## Production verification

- Application version: **2.59.0**.
- Final Worker deployment: **fefd4a9a-dcaa-4f7f-873b-da92a301024e**.
- Migration preserved all **23 preference rows**, verified by comparing the
  existing field values before/after; all acquired the default hour **10**.
- Existing push data remained **2 subscriptions, 7 events, 5 deliveries**;
  foreign-key validation reported zero violations. A final queue audit found
  the four report deliveries still accepted and no negative attempt counters.
- `/profile` and `/procedures` returned 200. Anonymous preferences and Premium
  report requests returned 401.
- Public billing configuration returned **EUR 5 monthly / EUR 49 annually**.
  Those configured values produce **EUR 11 annual savings / 18.3%**, without
  embedding either price in production frontend code.
- Production secrets, Stripe Price IDs, configured prices, tax configuration and
  payment processing were not changed. Migration 0036 records the release.

## Validation

Checks used an isolated copy matching the committed sources and locked dependency
versions. A temporary dependency drift during visual-tool setup was corrected by
`npm ci`; the final checks used the repository lockfile.

| Command/check | Result |
| --- | --- |
| `npm test` | 701 unit/UI tests across 34 files passed; 11 SEO, 17 push and 19 billing integration scenarios passed; 12 push and 2 Stripe Workers runtime cases passed. |
| `npm run lint` | Passed with no errors. Existing unrelated warnings remain. |
| `npm run build` | Production static export passed. Deployment rebuilt the final frontend. |
| Typecheck | No separate typecheck command or TypeScript configuration exists in this JavaScript project. |
| `npm run test:layout` | Firefox: 150 language/viewport layouts, 100 drawer layouts, 25 interaction sets, and Premium state passed. |
| Final sender regression | A queued report with a changed hour stays pending without a provider request or retry charge; an unrelated accepted delivery remains untouched. |
| Git hygiene | Diff whitespace, source parity and secret-pattern checks performed before commit. |

The layout check uses actual production components/CSS with explicit synthetic
procedure data and mocked billing responses. It covers all 25 languages at
1440, 1280, 1024, 768, 390 and 320 pixels; drawers at four widths; keyboard radio
selection; hour selection; Save/Compare callbacks and same-row alignment; and
horizontal overflow checks. Screenshots in Bulgarian, English, German, French
and Spanish were generated, with desktop/mobile examples visually reviewed.
Chrome was not opened. These checks do not claim a new real Google login,
physical-device push delivery or paid Stripe transaction.

To repeat visual checks:

```sh
npm ci
npx playwright install --with-deps firefox
npm run test:layout
```

Screenshots default to a temporary directory printed by the test. Set
`LAYOUT_ARTIFACT_DIR` to retain them at a chosen path. The existing GitHub Tests
workflow now runs lint and Firefox layout checks and retains screenshots for
seven days. Test fixtures and public translated labels are committed; build logs,
temporary deployment scripts, browser binaries and screenshots are not.

## References

- [IANA country timezone table](https://data.iana.org/time-zones/tzdb/zone1970.tab)
- [Intl.DateTimeFormat timezone handling](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [Cloudflare Workers practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Playwright Firefox installation](https://playwright.dev/docs/browsers#firefox)
