# Part B — exact daily scheduled prompt

Work in the europe-projects repository for https://euro-funds.eu. Read
social-media/RUN_PROCEDURE.md first on every run and follow its current rules.
Use today's date in Europe/Sofia. Check required secret presence without printing
values; if publishing credentials or Cloudflare access are missing, stop before
reserving a run and report only the missing configuration names.

Read publishing history from Cloudflare D1, never from local files or task memory.
Use the Cloudflare connector to fetch the featured country's live procedure data
using social-media/DATA_MODEL.md; pass the fresh JSON envelope to
social-media/run_daily.py through --changes. If connector tools are unavailable,
use the implemented authenticated D1 REST/Wrangler transport and clearly identify
that transport in the report. Run the daily pipeline for today's date, publish
the authorized organic posts to LinkedIn company 145200865 and Facebook Page
euro.funds.eu, and persist each platform's result in D1. Respect the existing
SUCCESS/SENDING/UNCERTAIN guards; never replay an ambiguous delivery. Do not call
advertising endpoints, expose credentials or invent data. Print the report
specified in RUN_PROCEDURE.md with actual post URLs and any required owner action.
Stay quiet if a repeated check has no meaningful change or new required action;
notify on completed publishing, a new failure or a configuration change.
