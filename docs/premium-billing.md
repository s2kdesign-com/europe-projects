# Premium billing and daily reports

Release: 2.57.0. Existing `users.role` grants are preserved. Billing never rewrites roles.

## Configuration and administration

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are Worker secrets. Never put their values in source, logs, D1, browser responses or build output. The live Stripe Product and recurring Prices are configured in D1, not seeded into source. Administrators manage the two plans in **Admin → Payments**. Currency amounts are stored as integer minor units. New prices create immutable Stripe Prices; existing subscriptions and invoices retain their historical price. Disabling a plan stops new purchases. Price edits require confirmation and the current revision.

Checkout accepts only `planId`; the server reads and verifies the active price, creates/reuses the user's Stripe customer and prevents duplicate open sessions/subscriptions. Return URLs never grant Premium. A dedicated customer portal configuration supports invoices, payment method changes and cancellation at period end. It does not modify other applications' portal configurations. The cron checks price access and portal configuration hourly; `billing_settings.configuration_health` stores safe results.

The Stripe endpoint is `https://euro-funds.eu/api/billing/webhook`, using API version `2026-08-26.dahlia`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_succeeded`, and `invoice.payment_failed`. The exact raw body, signature and timestamp are checked before processing. Event IDs and leases prevent concurrent/duplicate processing. Each event re-fetches the current subscription under a lock, so delayed events cannot restore canceled access. Stripe should retry a 503; failures retain a safe diagnostic code and can be redelivered from Stripe. Raw event payloads and payment details are not stored.

Paid entitlement requires an active subscription with paid-through and current-period end in the future, or a valid trial within its current period. Past-due, unpaid, incomplete, paused and canceled subscriptions do not grant access. Manual Premium/admin grants remain independent. Portal cancellation at period end retains access until that end. Account deletion requires billing to finish first; financial records remain with their user association cleared.

## Reports and notifications

Daily reports reuse `AIExecutionService`, purpose `recommendation`, its active provider/model and configured timezone (Europe/Sofia fallback). One bounded model job runs per two-minute cron. The unique user/date record, leases and a maximum of three attempts prevent duplicate publication and bound retries. The source sample is limited to 200 current procedures in the actual preferred country, ranked with the existing recommendation engine. Up to 12 candidates and 100 saved procedures are considered; the report explicitly identifies limited coverage. Incomplete profiles are reported honestly.

Only selected organization/sector/region/budget/interests data enters the model prompt. Names, emails, company registration numbers and private notes are excluded. Amounts, deadlines, eligibility and procedure links in the rendered recommendation are taken from database facts; model prose is treated as plain text and recommendations must reference supplied IDs. AI guidance is not an eligibility guarantee.

Reports are private, persisted by date and paginated. Every list/detail request verifies both current Premium access and ownership. Entitlement is checked before generation, publication and notification delivery. The existing Web Push pipeline is reused with a `report_id` discriminator and a daily-report preference. Free saved-procedure changes/deadlines/test notifications retain their existing behavior. Report links open `/profile?report=<id>#daily-reports`.

## Data and security

Migration `0031_premium_billing.sql` adds subscription plans, immutable Stripe prices, customer mappings, subscription snapshots, invoice/payment history, webhook events, configuration, locks/rate limits, checkout sessions, billing audit and daily AI reports. It adds one report preference and an optional report reference to existing push notifications. Plans begin disabled with no prices or external IDs. `0032_premium_release.sql` adds the release entry.

Payments and pricing APIs require an administrator cookie session. User billing/report APIs require an owner session. Mutations require same-origin checks. Read-only agent tokens cannot administer billing. Bodies, pagination, retries and action rates are bounded. API responses are no-store. Revenue is gross paid invoices, grouped by currency, before refunds/tax/fees; annual revenue and current monthly recurring equivalent are separate figures. This is operational reporting, not an accounting ledger.

Stripe Tax has not been enabled or configured by this change. Review applicable registrations and tax behavior before enabling automatic tax; see [Stripe Tax](https://docs.stripe.com/tax). Account-level billing emails and tax registrations are not changed by the implementation.

## Verification

Run `npm test` and `npm run build`. `test/billing.integration.mjs` uses SQLite and a controlled Stripe adapter for ownership, signed events, lifecycle ordering, payments, immutable pricing, reporting and preferences. `test/push-runtime.mjs` also verifies the actual Stripe SDK inside workerd with generated ephemeral signing material. UI tests cover dynamic plans, the server-only checkout contract, pending payment, safe report rendering and Payments loading. These tests do not charge a card or prove a real subscription renewal. See the release validation report for production evidence and remaining checks.
