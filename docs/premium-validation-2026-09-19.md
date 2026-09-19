# Premium release validation — 2026-09-19

## Implemented

Audited and reused manual Premium/admin roles, cookie sessions, profile/preferences, the existing AI service and Web Push infrastructure. Added server-selected monthly/annual Stripe Checkout, owner-bound Customer Portal, verified idempotent subscription/invoice webhooks, immutable price/payment history, current server-side entitlement, profile subscription/report UI, subtle border animation with reduced-motion support, private daily report history, Premium report notifications and an administrator-only Payments tab with configurable pricing, audit, filters, pagination and currency-separated totals.

Migration `0031_premium_billing.sql` adds plans, prices, customers, subscriptions, payments, webhook events, audit, configuration, locks/rate limits, checkout sessions and daily reports; extends existing notification preferences and push events. `0032_premium_release.sql` records version 2.57.0. Both are applied in production. Existing role counts remained unchanged across deployment.

## Validation performed

- `npm test`: PASS. 632 Vitest UI/unit tests, 11 SEO integration scenarios, 9 Web Push integration scenarios, 15 billing integration scenarios, 6 workerd notification sender cases and 2 workerd Stripe signature cases.
- `npm run build`: PASS, full Next.js static export. Wrangler deployment also rebuilt successfully.
- `npm run lint`: 12 pre-existing errors remain. These are conditional hooks in `app/admin/AiModelsTab.jsx`, a hook inside a callback in `LanguageRegionSection.jsx`, and existing Next link-rule violations in admin/profile/login/how-ai-works pages and AccountHeader/AppHeader. No added lint errors.
- `git diff --check`: PASS. Staged source and generated browser assets passed secret-pattern scans; the temporary encrypted credential bridge was removed.
- Source parity: all 35 changed implementation/test/migration/build files matched the isolated dependency/build directory. The isolated folder avoids OneDrive install stalls; its temporary diagnostics and credential bridge are not repository files.

Billing tests cover administrator access, CSRF, user ownership, server-only pricing, both intervals, stale pricing revisions, historical prices, duplicate Checkout, raw-body signature/timestamp validation, duplicate/out-of-order events, failed invoices, trials, period-end cancellation, Premium revocation, private report history, factual recommendation IDs, retries, notification preferences and financial-history preservation on account deletion. No test charges a real card.

## Production evidence

- Worker version: `de382865-3aa5-48fe-ac90-47069a05f2df`; public release 2.57.0.
- The user-approved prices are configured in live Stripe and D1: EUR 5 per month and EUR 49 per year. Public pricing returns integer minor-unit amounts 500 and 4900, without external Stripe IDs.
- `STRIPE_SECRET_KEY`: present. `STRIPE_WEBHOOK_SECRET`: present and matched to the dedicated Euro-Funds webhook. No secret value is recorded here or in source.
- The scheduled configuration check successfully retrieved and verified both prices using the deployed Stripe key, and created the dedicated Customer Portal configuration. Other products' Stripe endpoints/configurations were not edited.
- Signed diagnostic POST to `/api/billing/webhook`: 200/ignored, repeat: 200/duplicate. Invalid signature: 400. The diagnostic uses an unsupported event type and creates no payment or entitlement.
- Unauthenticated `/api/billing/status`, `/api/premium/reports` and `/api/admin/payments/plans`: 401 with no-store responses.
- The production scheduler generated reports for both eligible accounts on their first attempt using the existing configured AI provider/model. Both reports recorded insufficient profile/source information with zero invented recommendations. Report notifications were queued for eligible browser subscriptions.

## Limits of this evidence

No live card purchase, renewal or cancellation was performed. These lifecycle paths pass controlled Stripe-adapter integration tests, but a paid transaction is still required to confirm the complete live payment journey. Chrome and manual browser notification/click testing were skipped at the user's request. Report notification creation is verified; user-visible delivery requires an eligible active browser subscription and permission. No tax registrations or automatic-tax settings were changed; review [Stripe Tax guidance](https://docs.stripe.com/tax) before enabling it.

Implementation and operating details: [premium-billing.md](premium-billing.md).
