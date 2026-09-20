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

## Chrome browser connector (daily publishing)

Enable the Chrome connector in Codex and keep Chrome signed in to Facebook and
LinkedIn. The local scheduled task needs the desktop and connector available.
The signed-in user must be able to publish as the Euro-Funds Facebook Page and
LinkedIn organization 145200865. No social API app or access token is required.

Open https://www.facebook.com/euro.funds.eu/ and use the top-right profile menu
if necessary to switch to **Euro-Funds.eu - EU Funding & Grants**. Open
https://www.linkedin.com/feed/ directly, then enter the Euro-Funds company admin
view. Confirm the company author in the composer, not just the page heading.
`RUN_PROCEDURE.md` contains the complete browser sequence and D1 claim commands.

The Python entry point prepares the draft and PNG; the Codex Chrome connector
performs UI publishing. Python alone does not drive Chrome. Missing login or
Page permissions require the owner's action. Never copy browser cookies/tokens.
Optional legacy API setup is isolated in `API_SETUP.md` and is not a preflight
requirement for the daily browser task.

## Environment checklist

| Variable | Required/use |
| --- | --- |
| `OPENAI_API_KEY` | Image API; absent/failed API uses the gradient fallback |
| `OPENAI_IMAGE_MODEL` | Optional; defaults to `gpt-image-1.5`, model error fallback `gpt-image-1` |
| `CLOUDFLARE_API_TOKEN` | D1/KV access for Python; optional with preauthenticated local Wrangler |

The account/database/namespace IDs and LinkedIn organization ID are public
configuration. The browser task runs locally using signed-in Chrome sessions.
Run the dry-run before activation. An API transport opt-in is separate from the
browser task and must never be used as an automatic fallback.
