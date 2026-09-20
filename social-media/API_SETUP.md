# Optional API transport

Not used by the Chrome daily task. Requires explicit `--transport api`.

## Meta / Facebook Page

1. In Meta for Developers, create/select the owner's app and configure its
   Facebook Login/Page management use case. Associate the business/Page as
   required by Meta. The authenticating person needs Page access to publish.
2. Authorize the app with `pages_show_list`, `pages_read_engagement` and
   `pages_manage_posts`. Obtain a User access token through the app's OAuth flow
   or Graph API Explorer for the owner/admin. Complete app review/advanced access
   if Meta requires it for the intended users; development access is not a
   substitute for production approval.
3. Exchange the short-lived User token for a long-lived User token through
   `/oauth/access_token` with `grant_type=fb_exchange_token`, app credentials and
   the short-lived token. Perform this in a secure token tool; do not log output.
4. Call `/me/accounts?fields=id,name,access_token,tasks` using the long-lived User
   token. Select the exact Page **https://www.facebook.com/euro.funds.eu**. Save
   its numeric `id` as `FB_PAGE_ID` and its Page token as
   `FB_PAGE_ACCESS_TOKEN` in the scheduler's secret manager. Do not use the user
   token as the publisher's Page token. Check token type, permissions, Page
   identity and expiry with Meta's Access Token Debugger.
5. Set `FB_GRAPH_VERSION` to a supported version for the app. The implementation
   defaults to `v24.0` and requires v19 or later; verify support in the app
   dashboard before activation. Meta's documentation fetch was rate limited
   during implementation, and authenticated Meta calls have not been tested.

Image posts use `/PAGE_ID/photos` with a public PNG URL. Link posts use
`/PAGE_ID/feed`, both message text and an explicit `link` attachment. No ads or
boost API is called. Tokens can be revoked by role/password/app changes even
when they have a long lifetime; replace environment secrets when required.

References: [Page access/setup](https://developers.facebook.com/docs/pages-api/getting-started/),
[Page publishing](https://developers.facebook.com/docs/pages-api/posts/),
[long-lived access tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/).

## LinkedIn company Page

1. Create/select an app in LinkedIn Developers and associate the company Page
   **145200865**. Have its super admin verify the app.
2. Request Community Management API access and complete the required review.
   Confirm the app's Auth tab actually grants `w_organization_social`. A
   personal posting product alone does not grant company publishing.
3. Add an HTTPS redirect URL you control. Use the Developer Portal token
   generator, or the three-legged Authorization Code flow: authorize the
   organization admin at `/oauth/v2/authorization`, request the approved scopes,
   validate a cryptographically random `state`, and exchange the code at
   `/oauth/v2/accessToken` with the same redirect URL and the app credentials.
4. Save the resulting access token as `LINKEDIN_ACCESS_TOKEN`. Set
   `LINKEDIN_VERSION` to a currently supported six-digit YYYYMM version (the
   implementation was checked against the 202606 reference). The script sends
   `X-Restli-Protocol-Version: 2.0.0` and fixes the author to
   `urn:li:organization:145200865`.
5. Track the token's returned expiry. Reauthorize before expiry, or use the
   approved programmatic refresh flow if this app is eligible, updating the
   secret through your secret manager. Indefinite token validity is not assumed.

Images use initializeUpload, PUT PNG bytes, wait for AVAILABLE, then create the
post. Link posts use article content. An ambiguous publish response requires
reconciliation before replay; see `RUN_PROCEDURE.md`.

References: [Community Management access](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview),
[OAuth](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow),
[Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-06),
[Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-06).

