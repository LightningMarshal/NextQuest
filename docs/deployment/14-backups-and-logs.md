# 14 — Backups and logs

Two things that make a live app less of a black box: a copy of your data
that doesn't depend on anyone remembering to click a button, and a place
to look when something goes wrong. The first is optional and takes two
commands; the second is already on.

## Automatic backups (optional, recommended)

**What you get:** every Monday morning the app writes a complete snapshot
of your group's data — the same file as **Admin → Data export → Everything
(JSON)** — into a private storage bucket in your Cloudflare account, and
deletes snapshots older than about three months. Admin shows the most
recent ones and has a **Back up now** button.

**What it costs:** nothing realistic. Cloudflare R2's free allowance is
10 GB; a snapshot of a busy group is well under a megabyte.

> [!NOTE]
> R2 needs a payment method on file with Cloudflare even though you won't
> be charged at this size. If you'd rather not add one, skip this section —
> the manual export on the Admin page still works, and Neon keeps its own
> history (below).

### Turn it on

1. Create the bucket (once):

   **All platforms**

   ```bash
   npx wrangler r2 bucket create next-quest-backups
   ```

2. Open `wrangler.jsonc` in the project folder and find this block:

   ```jsonc
   // "r2_buckets": [
   // 	{ "binding": "BACKUPS", "bucket_name": "next-quest-backups" }
   // ],
   ```

   Remove the `//` from the start of those three lines, and save.

3. Deploy:

   **All platforms**

   ```bash
   npm run deploy
   ```

4. Open **Admin → Automatic backups** and click **Back up now**. A line
   with today's date and a size should appear.

> [!IMPORTANT]
> Do step 1 before step 3. A deploy that names a bucket which doesn't exist
> fails — nothing breaks, but nothing deploys either.

### Getting a snapshot back out

**All platforms**

```bash
npx wrangler r2 object get next-quest-backups/backups/nextquest-2026-11-09T04-30-00Z.json --file backup.json
```

(Use a real file name — list them in the Cloudflare dashboard under
**R2 → next-quest-backups → backups/**.)

The snapshot is a readable JSON file: members, games, sessions, attendance,
ratings, comments, polls. It deliberately leaves out anything that works
like a password (sign-in sessions, Discord webhook URLs, invite tokens) and
never contains individual votes — only totals.

> [!NOTE]
> A snapshot is a record, not a one-click restore. Putting data back into a
> database from it is a manual job. For "undo the last hour", use Neon's
> history instead ↓

### The other layer: Neon's point-in-time restore

Neon keeps a rolling history of your database and can rewind it — the
right tool when a migration or a mistake damaged data recently.

1. In the Neon console, open your project → **Backup & Restore** (older
   consoles call it **Restore**).
2. Pick a time just before the problem and follow the prompts. Neon can
   restore into a *new branch* first, so you can check it before switching.

The free plan keeps roughly a day of history; paid plans keep more. That's
why the weekly R2 snapshot exists as well: it reaches back months, and it
survives even if the Neon project itself is lost.

| | Neon restore | R2 snapshot |
| --- | --- | --- |
| Reaches back | hours to days | ~3 months |
| Restores | the whole database, exactly | nothing automatically — it's a file |
| Survives losing Neon | no | yes |
| Good for | "undo that" | "what did we have in August?", moving off, disaster |

## Logs: seeing what the app did

Already on — nothing to set up. Cloudflare keeps the app's logs for a few
days (3 on the free plan, 7 on paid): every page request, every scheduled
job, and every error.

**Where:** Cloudflare dashboard → **Workers & Pages** → **next-quest** →
**Observability** (or **Logs**).

Useful searches:

| To find | Search for |
| --- | --- |
| Why a scheduled job failed | `cron task` |
| Discord delivery problems | `[discord]` |
| Anything that crashed | filter by **Outcome: exception**, or search `error` |
| What happened at a certain time | set the time range at the top right |

Failed scheduled jobs also post a ⚠️ line to your Discord (the *Everything*
channels), so you'll usually hear about those without looking.

To watch logs live while you click around — handy when reproducing a
problem:

**All platforms**

```bash
npx wrangler tail
```

Press `Ctrl+C` to stop.

> [!NOTE]
> Want errors kept longer, grouped, and emailed to you? That's what a
> service like Sentry does. It needs its own account, so it isn't wired in —
> for a friend group, the built-in logs plus the Discord alert are enough.

---

← [13 — The Discord bot](13-discord-bot.md) · Next: [15 — Preview deploys →](15-preview-deploys.md)
