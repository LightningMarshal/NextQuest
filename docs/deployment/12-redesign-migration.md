# 12 — Upgrading a live app to the 2026-09 redesign

This chapter is for groups already running NextQuest who are moving to the
sessions-first redesign. It is written so **no existing data is lost** and
the upgrade can be undone.

## What changes in the database

Two migrations, both **additive** — nothing is dropped, renamed, or
narrowed:

- `0020_circle_sessions` — a `guest` value for `user_role`; per-person
  `calendar_feed_version`; new session columns (`visibility`, default
  `members` so every existing session keeps today's behaviour; `capacity`,
  `join_url`, `wrapped_up_at/by`, `auto_closed`); new tables `invites`,
  `invite_redemptions`, `membership_applications`, `discord_webhooks`,
  `event_discord_messages`, `game_interest`; two indexes.
- `0021_wrapped_up_backfill` — sets `wrapped_up_at` on already-completed
  sessions from their last-updated time.

Untouched: games, `game_status_history` (the burn-rate source), effort
points, votes, polls, ratings, comments, tags, settings. Votes stay
anonymous and are **not** converted into the new public "keen" marks.

## Before you start

1. **Export everything.** Admin → Data export → *Everything (JSON)*. Keep
   the file.
2. **Branch the database.** In the Neon console: your project → Branches →
   **Create branch** from `main` (e.g. `redesign-rehearsal`). A branch is an
   instant copy; nothing you do to it touches production.

## Rehearse on the branch

1. Copy the branch's connection string into `.env` (and `.dev.vars`).
2. `npm run db:migrate` — applies 0020 and 0021 to the **branch**.
3. `npm run preview` and click through with your real data: Home, a past
   session page, the Library, Stats (the legacy burn-rate should look
   exactly as before), Admin.
4. Optional rollback drill:
   `psql "<branch url>" -f drizzle-rollback/0020_0021_circle_sessions.down.sql`,
   then `npm run db:migrate` again. Both directions were tested on the
   seeded demo database.

## Upgrade production

> [!WARNING]
> `npm run deploy` runs `db:migrate` against whatever `DATABASE_URL` is in
> `.env` **before** deploying. Make sure `.env` points at the database you
> mean to migrate.

1. Point `.env` back at production's connection string.
2. Add any new secrets you want (all optional): `DISCORD_CLIENT_ID`,
   `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_IDS` (chapter 06).
3. `npm run deploy`.
4. On the live app: Admin → Discord → add/test your webhooks; set any wider
   server to *Open sessions only*.

The old code runs fine against the migrated schema (it never reads the new
columns), so the migration is safe even if the code deploy fails midway.

## Rolling back

Usually rolling back the **code** is enough: redeploy the previous version
(`npx wrangler rollback`, or check out the old commit and `npm run
deploy`). The extra columns and tables are simply ignored.

To also restore the old schema, run the rollback script against the
database (it drops only the redesign's own tables/columns — invites,
applications, webhooks, keen marks, session visibility/caps — and turns any
guests back into pending accounts):

```bash
psql "$DATABASE_URL" -f drizzle-rollback/0020_0021_circle_sessions.down.sql
```

Postgres can't remove a value from an enum, so `guest` stays in the
`user_role` type, unused — harmless, and it lets the migration re-apply
cleanly later.

## After the upgrade

- Everyone sees the new welcome tour once.
- Old links keep working: `/events` → Sessions, `/pick` and `/vote` →
  Library, `/pending-approval` → the application page.
- Existing calendar subscriptions (the old group-wide link) keep working;
  each person also gets their own link on the Sessions page.

---

[← 11 — Troubleshooting](11-troubleshooting.md) · [Index](README.md)
