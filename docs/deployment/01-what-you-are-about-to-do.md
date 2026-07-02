# 01 — What you are about to do

This chapter explains every concept the rest of the guide uses. Read it
once now; later chapters link back to specific sections when a term comes
up, so you never have to memorize anything.

## The shape of the thing

NextQuest is a **web app**: a program that runs on a computer somewhere on
the internet (a *server*) and talks to web browsers. When a friend opens
the app's address, their browser asks the server for the page, the server
builds it (reading from a database), and sends it back.

Deploying means getting that server-side program running on a machine
that's always on and reachable from the internet — not your laptop. By the
end of this guide, the pieces will be arranged like this:

```
your friends' browsers
        │
        ▼
Cloudflare Worker  ←— the app itself, running on Cloudflare's machines
  (next-quest)         at https://next-quest.<your-subdomain>.workers.dev
        │
        ▼
Neon Postgres      ←— the database: games, votes, events, members
```

Plus two supporting actors: **Google** (vouches for who is signing in) and
optionally **Discord** (receives notification messages).

One deployment serves **one friend group**. You, the person deploying, are
the group's admin: everyone else who signs in waits in an approval queue
until you let them in.

## What is a Cloudflare Worker?

Cloudflare is a company with computers all over the world. A **Worker** is
a small program you hand to Cloudflare, and they run it for you whenever
someone visits your URL. You never see or manage the machine it runs on —
no operating system to update, nothing to keep switched on. That's what
people mean by "serverless": there *is* a server, but it's not your
problem.

### What is workers.dev?

Every Cloudflare account gets a free web address space:
`<your-subdomain>.workers.dev`. You pick the subdomain once (chapter 03),
and your app's address becomes:

```
https://next-quest.<your-subdomain>.workers.dev
```

> [!NOTE]
> You do **not** need to buy a domain name, configure DNS, or pay for
> anything. The free address works exactly like any other website address.

## What is a database? What is a connection string?

A **database** is a separate program whose only job is storing and
retrieving data safely — think of it as a filing cabinet the app reads and
writes. This app uses **Postgres**, a battle-tested database, hosted by
**Neon** so that (like the Worker) you never manage the machine it runs on.

A **connection string** is the database's address, username, and password
packed into a single line, looking roughly like:

```
postgresql://someuser:somepassword@ep-something-pooler.aws.neon.tech/next_quest?sslmode=require
```

Because it contains the password, the connection string is a **secret** —
anyone who has it can read and change all of the app's data.

## What is a migration?

A brand-new database is an empty filing cabinet — no drawers, no labels.
**Migrations** are numbered scripts (in this repo: the `drizzle/` folder,
files `0000_…` through `0006_…`) that build the cabinet's structure:
tables for games, votes, events, members, and so on.

Running `npm run db:migrate` applies them, in order, exactly once each —
the database remembers which ones it has already run. You'll run it once
during setup (chapter 07) and again whenever an update ships new
migrations (chapter 10).

## What is "Sign in with Google" (OAuth)?

The app never sees or stores anyone's password. Instead, when someone
clicks **Sign in with Google**, their browser is sent to Google, they log
in *there* (or are already logged in), and Google sends them back to the
app with a sealed note saying "this really is alice@gmail.com". That
protocol is called **OAuth**.

The "sends them back" part is the detail that will matter most in this
guide: Google will only send people back to addresses you have registered
in advance, called **redirect URIs**. If the registered address differs
from the app's real address by even one character — `http` vs `https`, a
trailing slash, a typo — Google refuses and sign-in breaks. Chapter 05
registers these, and the [troubleshooting chapter](11-troubleshooting.md)
covers the failure.

## What is an environment variable? What is a secret?

Settings like the connection string and the Google credentials are **not
written into the code** (the code is public — secrets in it would be too).
Instead they're handed to the program from outside as named values, called
**environment variables**: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, and so on.

This project reads them from different places depending on where it's
running:

| Where the app runs | Where the variables live | Set up in |
| --- | --- | --- |
| Your computer (`npm run dev` / `npm run preview`) | A local file: `.dev.vars` | chapter 07 |
| Your computer, database tooling only (`npm run db:migrate`) | A second local file: `.env` (just `DATABASE_URL`) | chapter 07 |
| Cloudflare (the real deployment) | Cloudflare's secret store, filled via `npx wrangler secret put` | chapter 08 |

> [!IMPORTANT]
> The two local files exist because two different toolchains read them —
> the only thing you must remember is that `DATABASE_URL` has to be **the
> same** in both. Neither file is ever published or committed to git (the
> repo is configured to ignore them).

## What is a webhook?

A **webhook** is a special URL that, when the app sends a message to it,
makes that message appear somewhere — in this case, as a post in a Discord
channel. The app uses it to announce new game proposals, finished games,
vote milestones, scheduled sessions, and reminders. It's entirely
optional: with no webhook configured, the app simply doesn't post
(chapter 06).

## What is a cron job?

A **cron job** is an alarm clock for programs: "run this task on this
schedule." This app has two, defined in `wrangler.jsonc`:

- **Every hour**: check for upcoming events and post Discord reminders
  (~24 hours and ~1 hour before each one).
- **Daily at 06:00 UTC**: refresh stale game information (Steam review
  scores, playtime estimates) for a few games.

Two things about them to file away for later:

1. They run **only on the deployed Worker** — never while the app runs on
   your computer.
2. They're guarded by a password of your choosing called `CRON_SECRET`.
   If you skip setting it, the app still works, but the alarm clock rings
   into silence: no reminders, no refreshes
   ([chapter 08](08-deploy.md) sets it; [troubleshooting #10](11-troubleshooting.md#10-no-event-reminders-and-game-info-never-refreshes)
   covers the symptom).

## The approval model

When anyone signs in for the first time, they land in a **pending
approval** queue — by design, since this is a private app for one group.
There's one exception: email addresses listed in the `ADMIN_EMAILS`
setting skip the queue and arrive as approved admins, **but only on their
very first sign-in**. That's how *you* become the admin: by putting your
own email in `ADMIN_EMAILS` **before** you sign in for the first time.
Chapter 07 makes sure you get this right (and troubleshooting covers the
rescue if you don't).

---

[← Index](README.md) · Next: [02 — Set up your computer →](02-set-up-your-computer.md)
