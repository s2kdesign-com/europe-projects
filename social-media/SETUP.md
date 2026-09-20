# Euro-Funding daily publishing setup

The code is ready for Python 3.10+ with Pillow and Node 22+ when using Wrangler.
Cloudflare D1 is the sole history store; generated files are disposable.
No OpenAI, Facebook or LinkedIn secret is read from repository files. Supply
secrets in the execution environment, not command arguments or scheduled prompts.
Never paste credentials into a task message, commit them, or print API responses
from credential endpoints. Replace any credential already shared in chat.

## Install and validate

```sh
npm ci
python -m pip install -r social-media/requirements.txt
python -m unittest discover -s social-media/tests -v
python social-media/run_daily.py --date 2026-09-20 --dry-run --country BG
```

Use the current run date for subsequent checks. Dry-run reads live D1 history and
procedures, renders a local gradient preview, and prints both posts. It never
uploads, publishes, reserves a date, updates history, or calls the image API.

## Cloudflare

Account, D1 database, KV namespace and public image origin are in `config.json`.
The site uses `DB`; social history adds two isolated tables through
`migrations/0037_social_posts.sql`. The separate media Worker uses `IMAGES` and
only serves GET/HEAD PNG requests. Upload authorization stays in the Cloudflare
control plane. It exposes no write route and no database or credentials.

This setup created the tables and deployed the media Worker on 2026-09-20.
R2 is disabled in this account; KV is used for images, D1 for history/locking.
For another environment, create a dedicated namespace, update the public IDs in
both config files, apply the additive migrations and deploy:

```sh
npx wrangler d1 execute DB --remote --file migrations/0037_social_posts.sql
npx wrangler d1 execute DB --remote --file migrations/0038_social_release.sql
npx wrangler deploy --config social-media/wrangler.jsonc
```

Enable and authorize the Cloudflare connector in the scheduled environment.
Connector calls are agent tools, not Python APIs. Follow `DATA_MODEL.md` to pass
fresh results through `--changes`. Python still needs authenticated D1 access for
atomic publishing claims and history writes, and authenticated KV upload access.
Use `CLOUDFLARE_API_TOKEN` scoped to this account with D1 Edit and Workers KV
Storage Edit, or a preauthenticated Wrangler login on the local runner. The
connector's credentials are **not automatically exported** to scripts. No
credential scraping or copying from connector storage is implemented.

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

## Environment checklist

| Variable | Required/use |
| --- | --- |
| `OPENAI_API_KEY` | Image API; absent/failed API uses the gradient fallback |
| `OPENAI_IMAGE_MODEL` | Optional; defaults to `gpt-image-1.5`, model error fallback `gpt-image-1` |
| `FB_PAGE_ID` | Numeric ID of euro.funds.eu Page |
| `FB_PAGE_ACCESS_TOKEN` | Page token with publishing/engagement scopes |
| `FB_GRAPH_VERSION` | Optional; supported version, default `v24.0` |
| `LINKEDIN_ACCESS_TOKEN` | Organization-authorized access token |
| `LINKEDIN_VERSION` | Supported YYYYMM API version |
| `CLOUDFLARE_API_TOKEN` | D1/KV access for Python; optional with preauthenticated local Wrangler |

The account/database/namespace IDs and LinkedIn organization ID are public
configuration, not secrets. For a cloud Codex runner, allow network access to
Cloudflare, OpenAI, LinkedIn (including upload hosts), Meta and the public media
origin. Store secrets in that runner's environment. A desktop scheduled task
runs locally and does not itself provision or populate a cloud execution environment.

Run the dry-run before enabling the daily schedule, then allow the scheduled
procedure to publish with real credentials. This implementation session did not
publish to either social platform or make a billable image generation request.
