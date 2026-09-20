# Daily EU-27 social publishing

Entry point: `python social-media/run_daily.py --date YYYY-MM-DD`.
Run from the repository root. **Browser mode prepares a draft; follow RUN_PROCEDURE.md to publish through Chrome**.

- `SETUP.md`: Chrome session and Cloudflare setup.
- `RUN_PROCEDURE.md`: complete daily operating rules and retry/reconciliation policy.
- `DATA_MODEL.md` / `changes.sql`: verified production tables, SQL, links and connector evidence.
- `SCHEDULED_PROMPT.md`: exact Part B prompt saved in the Codex daily task.
- `VERIFICATION.md`: checks actually performed and remaining activation requirements.
- `countries.json` / `locales.json`: rotation, metadata, scenes and native-language copy.
- `localization.py`: requires source-bound field translations before composition and delivery; see `RUN_PROCEDURE.md` for the reviewed `--changes` envelope.
- `compose.py`: fact-preserving selection and copy limits.
- `make_image.py` / `fonts/`: image API, gradient fallback, layout and bundled Noto Sans.
- `browser_publish.py`: browser draft handoff, atomic claim, verified result and report.
- `API_SETUP.md`: optional legacy API credentials, not needed by the daily task.
- `publish_linkedin.py`, `publish_facebook.py`, `publishing.py`: guarded organic posts.
- `storage.py`, `common.py`, `config.json`: D1/KV transport and safe HTTP handling.
- `media-worker.js`, `wrangler.jsonc`, `worker-configuration.d.ts`: public PNG delivery.
- `history-export.py`: D1 export for human inspection; never a publishing input.
- `tests/`: offline content, rotation, failure, font, cloud guard and Worker checks.
- `requirements.txt`: Python dependency pin; `.gitignore` excludes runtime artifacts.
- `../migrations/0037_social_posts.sql`: additive history/lock schema.
- `../migrations/0038_social_release.sql`: required app changelog entry.

```sh
python -m unittest discover -s social-media/tests -v
node --test social-media/tests/media-worker.test.mjs
python social-media/run_daily.py --date YYYY-MM-DD --dry-run --country BG
python social-media/history-export.py --out social-media/history-export.json
```

There is no local history fallback. Images, snapshots, caches and secrets stay
out of Git; fonts and all executable pipeline code are committed.
