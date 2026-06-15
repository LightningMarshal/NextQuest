# 04 — Neon database

Neon hosts the Postgres database where all the app's data lives
([what's a database? →](01-what-you-are-about-to-do.md#what-is-a-database-what-is-a-connection-string)).
In this chapter you create a free database and copy its **connection
string** — the single most important secret in this whole setup.

## Create the account and project

1. Go to [neon.tech](https://neon.tech/) and click **Sign up**. You can
   sign up with the same Google account you use anyway, or email+password.
2. After signup, Neon asks you to **create a project**. A project is one
   database setup. Fill in:
   - **Project name**: `next-quest` (anything works; this is just a label).
   - **Postgres version**: leave the default.
   - **Region**: pick the one closest to where your friend group lives —
     it only affects speed a little.
   - **Database name**: if it lets you choose, use `next_quest`
     (underscore, not hyphen). If it created a default like `neondb`,
     that's fine too — the connection string you copy below carries
     whatever name it has.
3. Create the project. You land on the project dashboard.

## Copy the connection string

1. On the project dashboard, find the **Connect** button (or a
   "Connection string" / "Connection details" panel) and click it.
2. A dialog shows a string starting with `postgresql://`. Before copying,
   check one setting in that dialog:

> [!IMPORTANT]
> **Connection pooling must be ON.** The dialog has a toggle or dropdown
> for it (sometimes labeled "Pooled connection"). You can verify by eye:
> the **pooled** string's hostname contains `-pooler`, like
> `ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech`. The app's
> database driver only works through this pooled address — the "direct"
> string (same thing without `-pooler`) will fail in production in
> confusing ways
> ([troubleshooting #4](11-troubleshooting.md#4-the-deployed-app-shows-database-errors)).

3. Copy the full string. It looks like:

   ```
   postgresql://next_quest_owner:AbC123xyz@ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech/next_quest?sslmode=require
   ```

4. Confirm it ends with `?sslmode=require` or `?sslmode=require&channel_binding=require`. If yours doesn't, add it to
   the end exactly as written.

> [!NOTE]
> If the dialog hides the password behind a "show password" toggle, click
> it before copying so the real password is in the string, not asterisks.

## Two things that are normal (not broken)

- **The database sleeps.** On the free tier, Neon pauses the database
  after a period of inactivity and wakes it on the next request. The first
  page load after a quiet day can take a few seconds. Everything after is
  fast.
- **You don't create any tables now.** The cabinet stays empty until
  chapter 07, when `npm run db:migrate` builds the structure
  ([what's a migration? →](01-what-you-are-about-to-do.md#what-is-a-migration)).

## Write this down

> [!IMPORTANT]
> In your scratch note, record:
>
> - **Connection string**: the full `postgresql://…?sslmode=require` line,
>   with `-pooler` in the hostname.
>
> Treat it like a password — anyone with this string can read and modify
> all of the app's data.

---

[← 03 — Cloudflare](03-cloudflare.md) · [Index](README.md) · Next: [05 — Google sign-in →](05-google-sign-in.md)
