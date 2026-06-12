# 09 — After you deploy

A working deploy is more than a page that loads. Walk this checklist once;
each item says how to check it and where to look if it fails.

## 1. The site loads

Open `https://stooge-log.<your-subdomain>.workers.dev`. You should see the
sign-in page over https.

*If not*: give it a minute after the first deploy, then check the deploy
output for errors and see
[troubleshooting #7](11-troubleshooting.md#7-the-deployed-app-crashes-with-no-such-module-or-node-errors).

## 2. You are the admin

Sign in with your Google account. The account menu (top right) should show
an **Admin** entry, and opening **Admin** should show the member-management
and group-settings page.

*If you're stuck at "pending approval" instead*:
[troubleshooting #8](11-troubleshooting.md#8-you-the-deployer-are-stuck-on-pending-approval).

## 3. A friend can get in

Send the URL to one friend and have them sign in.

- **Expected**: they reach a **"pending approval"** page. This is correct
  behavior, not an error — the app is private.
- You open **Admin**, see them under *Pending approval*, click
  **Approve** — and on their next page load they're in.

*If they can't even reach the Google sign-in step* and see
**"Access blocked"**: your OAuth consent screen is in Testing mode and
they're not a test user — revisit
[chapter 05's choice](05-google-sign-in.md#configure-the-consent-screen)
([troubleshooting #3](11-troubleshooting.md#3-a-friend-gets-access-blocked-when-signing-in)).

## 4. Discord notifications (if you configured them)

Propose a test game in the app (Backlog → propose). Within a second or
two, the webhook should post a 🎮 message in your channel. (Delete the
test game afterwards by rejecting the proposal, if you like.)

*If nothing appears*:
[troubleshooting #11](11-troubleshooting.md#11-no-discord-messages).

## 5. The scheduled jobs are armed

The cron jobs
([what are these? →](01-what-you-are-about-to-do.md#what-is-a-cron-job))
only exist on the deployed Worker, and they run on Cloudflare's clock in
**UTC** — nothing happens immediately after deploying, and nothing ever
happens when running locally. To confirm they're set up:

1. Cloudflare dashboard → **Workers & Pages** → **stooge-log** →
   **Settings** → look for **Triggers** / **Cron Triggers**. You should
   see two schedules: `0 * * * *` (hourly — event reminders) and
   `0 6 * * *` (daily 06:00 UTC — game-info refresh).
2. The worker has logging enabled. After the next top of the hour, the
   worker's **Logs** tab should show a scheduled invocation.

Impatient? You can trigger a task by hand. This calls the same endpoint
the scheduler does, authenticated with your `CRON_SECRET` (replace both
placeholders):

**Windows (PowerShell)**

```powershell
Invoke-WebRequest -Uri "https://stooge-log.<your-subdomain>.workers.dev/api/cron?task=event-reminders" -Headers @{ "x-cron-secret" = "<your-CRON_SECRET>" }
```

**macOS**

```bash
curl -H "x-cron-secret: <your-CRON_SECRET>" "https://stooge-log.<your-subdomain>.workers.dev/api/cron?task=event-reminders"
```

**Linux**

```bash
curl -H "x-cron-secret: <your-CRON_SECRET>" "https://stooge-log.<your-subdomain>.workers.dev/api/cron?task=event-reminders"
```

Expected: a small JSON reply like `{"task":"event-reminders","sent1h":0,"sent24h":0}`
(zeros are fine — you have no imminent events yet). The other task name is
`refresh-metadata`.

*If you skipped `CRON_SECRET`*: the jobs silently do nothing — see
[troubleshooting #10](11-troubleshooting.md#10-no-event-reminders-and-game-info-never-refreshes)
to enable them later.

## 6. Day-2 things worth knowing

- **First load after a quiet day is slow** — that's the free-tier Neon
  database waking up ([chapter 04](04-neon-database.md#two-things-that-are-normal-not-broken)),
  not a problem.
- **The Logs tab is your friend.** Cloudflare dashboard → your worker →
  **Logs** shows live requests and errors from the deployed app — the
  first place to look whenever "the site is acting weird".
- **Adding admins later**: the `ADMIN_EMAILS` bootstrap only affects
  *first-ever* sign-ins. To promote an existing member, use the **Admin**
  page's "Make admin" button instead.
- Set up your group: open **Admin → Group settings** to name the group and
  tune the voting budget; then propose your first real games.

---

[← 08 — Deploy](08-deploy.md) · [Index](README.md) · Next: [10 — Updating the app →](10-updating-the-app.md)
