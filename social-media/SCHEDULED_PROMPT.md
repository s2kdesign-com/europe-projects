Work in the europe-projects repository for https://euro-funds.eu. Read
social-media/RUN_PROCEDURE.md first on every run and follow its current rules.
Use today's date in Europe/Sofia. Publish through the Chrome browser connector
using the signed-in browser sessions, not Facebook/LinkedIn APIs. Do not require
FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, LINKEDIN_ACCESS_TOKEN or LINKEDIN_VERSION.

Open https://www.facebook.com/euro.funds.eu/ in Chrome. If the active identity is
different, click the profile menu at the top right and switch to Euro-Funds.eu -
EU Funding & Grants, using See all profiles when necessary. Open LinkedIn directly
at https://www.linkedin.com/feed/, then enter company 145200865's admin view.
Confirm Euro-Funds | EU Funding & Grants in the LinkedIn composer. Check the
exact Euro-Funds author on both platforms before posting. Never publish as the
personal profile or another business. If Chrome, login, Page permissions or
Cloudflare access is unavailable, report the specific blocker before reserving.

Read publishing history from Cloudflare D1, never local files or task memory.
Fetch live procedure data through the Cloudflare connector as documented in
social-media/DATA_MODEL.md and pass the fresh envelope through --changes. If
connector tools are unavailable, use the authenticated D1 REST/Wrangler transport
and identify it in the report. Prepare with run_daily.py --transport browser.
Before preparation, review and translate each title, budget explanation and
applicant field into the scheduled posting language. Add the source-bound
localization review required by RUN_PROCEDURE.md to the fresh --changes envelope.
Do not trust project original_language for individual fields or publish fallback
source-language prose. Preserve numbers, dates, currencies, links and meaning.
Use the Chrome connector to upload the prepared PNG and publish the saved text
as organic posts. Use browser_publish.py claim immediately before each final
Post click, and record each verified permalink immediately afterwards. Respect
SUCCESS/SENDING/UNCERTAIN guards, never replay an ambiguous delivery, and report
preparation as preparation rather than publication. Do not call advertising
endpoints, expose credentials or invent data. Print the report specified in
RUN_PROCEDURE.md with actual post URLs and any required owner action.
Stay quiet on unchanged repeated checks; notify on completed publishing, a new
failure, or a configuration change requiring action.
