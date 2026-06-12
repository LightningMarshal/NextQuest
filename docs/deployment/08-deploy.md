# 08 — Deploy

This is the chapter where the app goes live. Two stages: hand your secrets
to Cloudflare, then push the code.

Have your scratch note ready. You'll need:

- ✅ Neon connection string (ch. 04)
- ✅ Google Client ID and Client Secret (ch. 05)
- ✅ Your `BETTER_AUTH_SECRET` (ch. 07)
- ✅ Your **predicted app URL** (ch. 03)
- ✅ Your `ADMIN_EMAILS` value — your own email(s)! (ch. 07)
- ◻️ Discord webhook URL (ch. 06, optional)
- ◻️ Your `CRON_SECRET` (ch. 07, optional but recommended)

## Stage 1: put the secrets into Cloudflare

The deployed app cannot see your `.dev.vars` file — that file never leaves
your computer. Production secrets live in Cloudflare's own secret store,
set one at a time with `npx wrangler secret put NAME`. Each command
**prompts you to paste the value** (the input stays hidden, like a
password prompt) and press <kbd>Enter</kbd>.

Run these from the project folder, pasting the listed value at each
prompt:

**All platforms**

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ADMIN_EMAILS
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put CRON_SECRET
```

| Secret | Value to paste |
| --- | --- |
| `DATABASE_URL` | Your Neon connection string — same one as `.dev.vars` |
| `BETTER_AUTH_SECRET` | The one from chapter 07 (or generate a fresh one with `npx @better-auth/cli secret` — also fine) |
| `BETTER_AUTH_URL` | **Your predicted app URL** — `https://stooge-log.<your-subdomain>.workers.dev`. `https`, your real subdomain, **no trailing slash** |
| `GOOGLE_CLIENT_ID` | From chapter 05 |
| `GOOGLE_CLIENT_SECRET` | From chapter 05 |
| `ADMIN_EMAILS` | Your email(s), comma-separated, no spaces |
| `DISCORD_WEBHOOK_URL` | The webhook URL — *skip this command entirely if you skipped chapter 06* |
| `CRON_SECRET` | Your random string from chapter 07 — *skippable, but then reminders and metadata refresh never run* ([why →](01-what-you-are-about-to-do.md#what-is-a-cron-job)) |

> [!NOTE]
> The first `secret put` may say it can't find the Worker and ask whether
> to create it — answer **yes**. And do **not** set `NEXTJS_ENV` in
> production; that setting is for local development only.

Verify the list — it should print the names (never the values) of
everything you just set:

**All platforms**

```bash
npx wrangler secret list
```

## Stage 2: deploy

**All platforms**

```bash
npm run deploy
```

This rebuilds the app for Cloudflare's runtime (same build as
`npm run preview`) and uploads it — a few minutes. Near the end, the
output prints the live address, like:

```
Deployed stooge-log triggers (…)
  https://stooge-log.mike-pond.workers.dev
  schedule: 0 * * * *
  schedule: 0 6 * * *
```

(The two `schedule:` lines are the cron jobs being registered — a good
sign.)

## Checkpoint: does the printed URL match your prediction?

Compare the printed URL **character-for-character** against the predicted
URL in your scratch note (the one you gave Google and
`BETTER_AUTH_URL`).

**If it matches** (it should): open it in a browser, click **Continue with
Google**, sign in — you should land on the dashboard as admin, exactly as
you did locally. **The app is live.** 🎉 Continue to
[chapter 09](09-after-you-deploy.md).

**If it differs** — wrong subdomain in the note, typo, anything — the site
will load but sign-in will fail. The fix takes two minutes and needs no
redeploy:

> [!IMPORTANT]
> **Fixing a mismatched URL**
>
> 1. Re-run `npx wrangler secret put BETTER_AUTH_URL` and paste the URL
>    **as actually printed** by the deploy (secrets take effect
>    immediately; no redeploy needed).
> 2. In the Google Cloud console, open **Credentials** → your OAuth
>    client, and correct the production redirect URI to
>    `<printed-URL>/api/auth/callback/google`.
> 3. Reload the app and sign in again. Update your scratch note.

---

[← 07 — Run it on your computer](07-run-it-on-your-computer.md) · [Index](README.md) · Next: [09 — After you deploy →](09-after-you-deploy.md)
