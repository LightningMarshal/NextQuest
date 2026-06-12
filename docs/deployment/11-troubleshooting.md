# 11 — Troubleshooting

Find what you're seeing in the table, jump to the entry. Each one gives
the cause, the fix, and the chapter that prevents it next time.

| # | What you see |
| --- | --- |
| [1](#1-google-shows-error-400-redirect_uri_mismatch) | Google: `Error 400: redirect_uri_mismatch` |
| [2](#2-sign-in-loops-or-fails-with-statecookie-errors-after-deploying) | Sign-in loops or fails with state/cookie errors after deploying |
| [3](#3-a-friend-gets-access-blocked-when-signing-in) | A friend gets "Access blocked" when signing in |
| [4](#4-the-deployed-app-shows-database-errors) | The deployed app shows database errors |
| [5](#5-npm-run-dbmigrate-fails) | `npm run db:migrate` fails |
| [6](#6-migrations-ran-but-the-app-cant-find-tables) | Migrations ran, but the app can't find tables |
| [7](#7-the-deployed-app-crashes-with-no-such-module-or-node-errors) | Deployed app crashes with "no such module" / `node:` errors |
| [8](#8-you-the-deployer-are-stuck-on-pending-approval) | *You* (the deployer) are stuck on "pending approval" |
| [9](#9-friends-see-pending-approval) | Friends see "pending approval" |
| [10](#10-no-event-reminders-and-game-info-never-refreshes) | No event reminders; game info never refreshes |
| [11](#11-no-discord-messages) | No Discord messages |
| [12](#12-npx-wrangler-login-hangs-or-cant-open-a-browser) | `npx wrangler login` hangs / can't open a browser |
| [13](#13-npm-install-or-npm-run-dev-fails-with-strange-syntax-errors) | `npm install` / `npm run dev` fails with strange syntax errors |
| [14](#14-npm-run-preview-behaves-differently-from-npm-run-dev) | `npm run preview` behaves differently from `npm run dev` |
| [15](#15-when-all-else-fails-reading-the-live-logs) | When all else fails: reading the live logs |

---

## 1. Google shows `Error 400: redirect_uri_mismatch`

**Cause**: the address the app sent people to Google from isn't on the
OAuth client's registered redirect-URI list — they must match
character-for-character.

**Fix**: in the Google Cloud console, open **Credentials** → your OAuth
client, and compare the URIs against reality:

- local development needs exactly `http://localhost:3000/api/auth/callback/google`
- production needs exactly `<your-app-URL>/api/auth/callback/google`, e.g.
  `https://stooge-log.mike-pond.workers.dev/api/auth/callback/google`

Hunt for the classics: trailing slash, `http` instead of `https`, a typo
in the subdomain, or a missing `/api/auth/callback/google` path. The error
page's "details" link shows the URI that was actually attempted — compare
against what's registered.

**Prevented in**: [chapter 05](05-google-sign-in.md#create-the-oauth-credentials).

## 2. Sign-in loops or fails with state/cookie errors after deploying

**Cause**: the `BETTER_AUTH_URL` secret doesn't equal the app's real
deployed URL (typically: the predicted URL from chapter 03 turned out
wrong, or it was set with a trailing slash / wrong subdomain). The app
builds its sign-in redirects from this value, so a mismatch breaks the
round trip even when Google's side is fine.

**Fix**: run the two-minute recovery in
[chapter 08's checkpoint](08-deploy.md#checkpoint-does-the-printed-url-match-your-prediction):
re-`put` the secret with the URL exactly as the deploy printed it, fix the
Google redirect URI to match, reload.

**Prevented in**: [chapter 03](03-cloudflare.md#predict-your-apps-url) +
[chapter 08](08-deploy.md).

## 3. A friend gets "Access blocked" when signing in

**Cause**: your Google OAuth consent screen is in **Testing** publishing
status, and the friend isn't on the test-user list. In Testing mode Google
only lets listed users through.

**Fix**: in the Google Cloud console, open the **OAuth consent screen** /
**Audience** page, then either add the friend's Gmail under **Test
users**, or click **Publish app** (fine for this app — it requests no
sensitive scopes, and stooge-log's own approval queue keeps strangers
out).

**Prevented in**: [chapter 05](05-google-sign-in.md#configure-the-consent-screen).

## 4. The deployed app shows database errors

**Cause** (one of): the production `DATABASE_URL` secret holds the
**direct** Neon string instead of the **pooled** one (hostname missing
`-pooler`); the string is missing `?sslmode=require`; or it was copied
from a different Neon project.

**Fix**: in Neon, open **Connect**, switch **Connection pooling ON**, copy
the string, confirm `-pooler` in the hostname and `?sslmode=require` at
the end, then re-run `npx wrangler secret put DATABASE_URL` and paste it.
Takes effect immediately.

**Prevented in**: [chapter 04](04-neon-database.md#copy-the-connection-string).

## 5. `npm run db:migrate` fails

Typical errors: `getaddrinfo ENOTFOUND ep-xxx...`, `password
authentication failed`, or `url: ''`.

**Cause**: the `.env` file still contains the placeholder string from
`.env.example` (or is missing). The migrate command reads **only `.env`**
— putting the real string in `.dev.vars` is not enough.

**Fix**: open `.env` and paste your real Neon connection string as
`DATABASE_URL=postgresql://…?sslmode=require`. Re-run
`npm run db:migrate`.

**Prevented in**: [chapter 07](07-run-it-on-your-computer.md#fill-in-env).

## 6. Migrations ran, but the app can't find tables

**Cause**: `.env` and `.dev.vars` contain **different** connection strings
— the migrations built tables in one database while the app reads from
another (different Neon projects, or different database names within
one).

**Fix**: make `DATABASE_URL` byte-identical in both files (and, if
already deployed, in the production secret), then re-run
`npm run db:migrate` once so the database the app actually uses has the
tables.

**Prevented in**: [chapter 07](07-run-it-on-your-computer.md#fill-in-env).

## 7. The deployed app crashes with "no such module" or `node:` errors

**Cause**: the `nodejs_compat` compatibility flag was removed from
`wrangler.jsonc`. The database driver, sign-in library, and friends all
need Node-style modules, which Cloudflare's runtime only provides with
that flag.

**Fix**: in `wrangler.jsonc`, ensure `compatibility_flags` still contains
`"nodejs_compat"`, then `npm run deploy` again. Generally: don't edit
`wrangler.jsonc` at all while following this guide.

## 8. *You* (the deployer) are stuck on "pending approval"

**Cause**: you signed in **before** `ADMIN_EMAILS` contained your address
(or it has a typo / different Google address than you actually used). The
admin bootstrap runs only on an account's *first-ever* sign-in, so fixing
the setting alone doesn't rescue an account that already exists.

**Fix**:

1. Correct the email list: locally in `.dev.vars`, and in production via
   `npx wrangler secret put ADMIN_EMAILS`.
2. Delete your half-created user so your next sign-in counts as the first:
   run **All platforms** `npm run db:studio`, open the printed URL, open
   the `user` table, find the row with your email, delete it.
3. Sign in again — you arrive approved, as admin.

**Prevented in**: [chapter 07](07-run-it-on-your-computer.md#admin_emails).

## 9. Friends see "pending approval"

**Not a bug.** New sign-ins wait for approval by design
([the approval model →](01-what-you-are-about-to-do.md#the-approval-model)).
Open **Admin** in the app and approve them. They get in on their next page
load.

## 10. No event reminders, and game info never refreshes

…and no errors anywhere, which is the confusing part.

**Cause**: the `CRON_SECRET` production secret was never set. By design,
the scheduled jobs quietly do nothing without it.

**Fix**: generate a value
(`node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`),
run `npx wrangler secret put CRON_SECRET`, paste it. Confirm the triggers
exist and start firing:
[chapter 09, step 5](09-after-you-deploy.md#5-the-scheduled-jobs-are-armed).
Remember reminders also need a Discord webhook to have anywhere to go.

**Prevented in**: [chapter 08](08-deploy.md).

## 11. No Discord messages

**Cause** (one of): `DISCORD_WEBHOOK_URL` was never set (notifications are
off — that's a supported choice, see [chapter 06](06-discord-notifications.md));
the webhook was deleted in Discord's settings; or the URL was pasted with
a typo. Discord failures are deliberately silent — they never break the
app.

**Fix**: re-copy the webhook URL from Discord (channel → Edit Channel →
Integrations → Webhooks) or create a new webhook, then set it locally in
`.dev.vars` and/or in production via
`npx wrangler secret put DISCORD_WEBHOOK_URL`. Test by proposing a game.

## 12. `npx wrangler login` hangs or can't open a browser

**Cause**: wrangler tries to open your default browser for the
authorization page; on some Linux setups or remote machines it can't.

**Fix**: wrangler prints the authorization URL in the terminal — copy it
into any browser, approve, and the terminal completes by itself. Verify
with `npx wrangler whoami`.

## 13. `npm install` or `npm run dev` fails with strange syntax errors

**Cause**: Node.js too old (or `node --version` errors — not installed /
terminal opened before the install finished).

**Fix**: install the current LTS from
[chapter 02](02-set-up-your-computer.md#install-nodejs), **close and
reopen the terminal**, confirm `node --version` prints 20.x or higher,
delete nothing, just re-run `npm install`.

## 14. `npm run preview` behaves differently from `npm run dev`

**Expected.** `dev` runs under Node.js (fast, lenient); `preview` runs the
real production build under Cloudflare's runtime. When they disagree,
**preview is the truth** — it's what the deployed app will do. A page that
errors only under preview means the error will also happen in production;
read the message in the preview terminal. (Sign-in not working under
preview is the one known non-issue:
[chapter 07](07-run-it-on-your-computer.md#dress-rehearsal-under-the-real-runtime).)

## 15. When all else fails: reading the live logs

The deployed app logs every request and error. Cloudflare dashboard →
**Workers & Pages** → **stooge-log** → **Logs** → begin the live stream,
then reproduce the problem in another tab and watch what appears. Error
lines usually name the failing piece (database, auth, a specific page) —
which maps to a chapter of this guide.

Still stuck? File an issue on the repository with: what you did, what you
saw (exact error text), and what the live log showed. Never paste your
secrets or connection string into an issue.

---

[← 10 — Updating the app](10-updating-the-app.md) · [Index](README.md)
