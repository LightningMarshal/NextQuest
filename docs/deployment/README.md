# Deploying stooge-log — the beginner's guide

This guide takes you from a blank computer to a live website your friends
can sign into with their Google accounts. It assumes **no prior
experience**: you've never deployed a website, and you don't need to know
what Cloudflare, a database, or OAuth are — every concept is explained
before it's used.

Expect the whole thing to take **2–3 hours** the first time, most of it
clicking through account signups. The total cost is **$0**: everything in
this guide fits comfortably inside free tiers (see
[What this costs](#what-this-costs) below).

> [!NOTE]
> Already comfortable with Node, Cloudflare, and OAuth? The short version
> lives in the [repo README's Quickstart](../../README.md#quickstart) and
> [CLAUDE.md](../../CLAUDE.md). This guide is the long version, for everyone
> else.

## The chapters

Work through them in order — later chapters use values you write down in
earlier ones.

| Chapter | What you'll do |
| --- | --- |
| [01 — What you are about to do](01-what-you-are-about-to-do.md) | Understand the moving parts: workers, databases, sign-in, secrets. The glossary every other chapter links back to. |
| [02 — Set up your computer](02-set-up-your-computer.md) | Open a terminal, install Node.js and git, download the code. |
| [03 — Cloudflare](03-cloudflare.md) | Create the account the app will run on, and predict your app's future web address. |
| [04 — Neon database](04-neon-database.md) | Create the database the app stores everything in, and copy its connection string. |
| [05 — Google sign-in](05-google-sign-in.md) | Set up "Sign in with Google" so you and your friends can log in. |
| [06 — Discord notifications](06-discord-notifications.md) | *Optional.* Make the app post updates to a Discord channel. |
| [07 — Run it on your computer](07-run-it-on-your-computer.md) | Fill in the settings files, set up the database tables, and try the app locally. |
| [08 — Deploy](08-deploy.md) | Put your secrets into Cloudflare and push the app live. |
| [09 — After you deploy](09-after-you-deploy.md) | Verify everything works, invite your friends, check the scheduled jobs. |
| [10 — Updating the app](10-updating-the-app.md) | What to do when the code changes later. |
| [11 — Troubleshooting](11-troubleshooting.md) | Every common failure: what you see, why it happened, how to fix it. |

## Accounts you will create (and why)

- **Cloudflare** — the company whose computers will run the app. Free.
- **Neon** — hosts the Postgres database where all the app's data lives. Free.
- **Google Cloud** — not for hosting; only so the app can offer
  "Sign in with Google". Free.
- **Discord webhook** — *optional*; lets the app post messages to a channel
  in a server you already have.

## What this costs

Nothing, for a friend group:

- **Cloudflare Workers free plan**: 100,000 requests per day, scheduled
  (cron) jobs included. A group of friends checking a backlog uses a tiny
  fraction of this.
- **Neon free tier**: one project with ~0.5 GB of storage; the database
  pauses itself when idle and wakes on the next request (you may notice the
  first page load after a quiet day is slower — that's normal).
- **Google OAuth**: free.
- You do **not** need to buy a domain name. Cloudflare gives you a free
  `*.workers.dev` address ([chapter 03](03-cloudflare.md)).

## How commands are shown

Commands appear in boxes, grouped by operating system, always in this
order — copy the one matching yours:

**Windows (PowerShell)**

```powershell
Copy-Item .dev.vars.example .dev.vars
```

**macOS**

```bash
cp .dev.vars.example .dev.vars
```

**Linux**

```bash
cp .dev.vars.example .dev.vars
```

When a command is identical everywhere (true for everything starting with
`npm`, `npx`, or `git`), you'll see a single box labeled **All platforms**:

**All platforms**

```bash
npm install
```

Callout boxes mark things that matter:

> [!NOTE]
> Useful background — safe to skim.

> [!IMPORTANT]
> Do this exactly, or a later step fails.

> [!WARNING]
> A common mistake that breaks things, and how to avoid it.

## Keep a scratch note

Several chapters end with a **Write this down** box. Keep a private note
(a text file is fine — just don't post it anywhere) and collect these as
you go:

1. Your Cloudflare subdomain and predicted app URL (chapter 03)
2. Your Neon connection string (chapter 04)
3. Your Google Client ID and Client Secret (chapter 05)
4. Your Discord webhook URL (chapter 06, optional)
5. Two generated secrets — `BETTER_AUTH_SECRET` and `CRON_SECRET`
   (chapter 07)

Treat everything except the URL like a password.

> [!NOTE]
> The third-party websites (Cloudflare, Neon, Google, Discord) redesign
> their dashboards now and then. This guide describes clicks by the *name*
> of the page or button, so if something has moved, use the site's search
> box to find the page with that name.

---

Next: [01 — What you are about to do →](01-what-you-are-about-to-do.md)
