# NextQuest

**NextQuest** helps a gaming group play more games with more people. Post
"I'm playing Rust Tuesday night, hop in" in a few taps; it shows up on
everyone's home screen and as a Discord card that updates itself as people
join; friends-of-friends can join too; and afterwards a ten-second wrap-up
records who came and how it went. Around the sessions sit a rich game
library, find-a-time polls for the nights that need planning, and stats.

One deployment serves one group. Members sign in with Google (or Discord);
a wider circle of guests can see and join the sessions you mark **open**.

## Feature tour

### This week (home)

What's live now and coming up, with who's in and a one-tap **I'm in /
Maybe / Out** on every card. Sessions that need a wrap-up, games people are
want to play, open polls, and recently played nights with how they went.

### Posting a session

Pick a game (or type a new one), tap a time — *Now*, *Tonight 8pm*,
*Tomorrow*, *Saturday*, or any date — and choose **open to the circle** or
**members only**. Length, seat cap, where, a join link, and notes are
optional. You're in automatically and Discord hears about it.

### A page for every session

The link in Discord goes here. Before: when (in your timezone), what, who's
hosting, who's in and how many seats are left, the join link, "last time we
left off…", and an **Add to calendar** file that works in any calendar app.
The host (or an admin) can edit or cancel. After: who came, a star rating,
a one-line recap, and **same time next week**. Sessions nobody wraps up
close themselves after two days.

### Discord

Each connected webhook gets one card per session — when, game, host, where,
who's in — and the app **edits that same card** as people join, the time
moves, or it's cancelled or played. Add several webhooks on the admin page:
the group's own server hears everything; a wider server can be set to hear
only about open sessions. Reminders go out a day and an hour before, with
who's in. Mentions are always disabled.

### The circle: guests, invites, applications

- **Invite links**: any member can make one (limited uses, expiry,
  revocable). Whoever opens it signs in and joins as a guest.
- **Discord sign-in**: members of the Discord servers you list come
  straight in as guests.
- **Guests** see and join open sessions only — no library, stats, or
  members-only sessions — and can **apply for membership** (who they are,
  why, who they know); admins approve on /admin.

### Library

Every game with art, genres, play modes, time-to-beat (HowLongToBeat),
Steam/Metacritic/BGG reception, tabletop system and player counts, the full
description, and **who'd play it** (an "I'd play this" button). Search and filter by type, genre, mode, or
tag; post a session for any game in one tap. Games come in search-first
from Steam/HLTB/RAWG (video) or BoardGameGeek/RPGGeek (tabletop), with
manual entry always available.

### Planning ahead

For bigger nights, open a **find-a-time** poll: everyone paints the times
they're free on a grid, the best windows float to the top, and one click
turns the winner into a session with RSVPs filled in.

### Stats & history

Sessions played, hours together, average rating, who comes most, a year in
review with a group game of the year, per-member pages, and the legacy
effort burn-down from before the 2026 redesign.

### Admin

Applications, waiting sign-ins, members and guests, live invite links,
Discord webhooks (with a test button), group settings, and a full data
export.

## How it works

- **Access**: members, guests ("the circle"), and pending sign-ins; every
  page and server action checks the tier on the server, and guests only
  ever receive open sessions — the filter lives in the database queries.
- **Sessions** are rows in `events` with a visibility, optional seat cap,
  host, and wrap-up fields; the rules (live/ended, who may RSVP, edit, or
  wrap up, when to auto-close) are pure, unit-tested functions.
- **History is append-only**: game status changes go through one function
  that records every transition; past effort points are frozen, so older
  charts never rewrite themselves.
- **Metadata providers fail soft**: a broken lookup means fewer pre-filled
  fields, never a blocked game or session.

Design decisions and their reasoning: [docs/DECISIONS.md](docs/DECISIONS.md).

## Architecture

```
friends' browsers
       │ https
       ▼
Cloudflare Worker (next-quest) ── custom-worker.ts wraps the OpenNext build
       │                          and adds a `scheduled` cron handler that
       │                          self-fetches /api/cron via the
       │                          WORKER_SELF_REFERENCE binding
       ▼
Next.js App Router (server actions, per-request auth gates)
       │                                   │
       ▼                                   ▼
Neon Postgres (HTTP driver,         Steam · HowLongToBeat · RAWG · BGG
per-request Drizzle client)         (metadata providers, fail-soft)
                                           │
                                    Discord webhooks (session cards edited
                                    in place) · Discord OAuth (guests)
```

## Stack

- Next.js 16 (App Router, TypeScript) on Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- Neon Postgres + Drizzle ORM
- Better Auth (Google, optional Discord sign-in)
- Tailwind CSS v4 + shadcn/ui-style components, Recharts

## Quickstart

> New to deploying? The Quickstart below assumes you already have Node,
> accounts, and credentials — if not, follow the
> **[step-by-step deployment guide](docs/deployment/README.md)**.

```bash
npm install

# Workers runtime secrets (dev/preview): DB, auth, Google OAuth
cp .dev.vars.example .dev.vars

# Node-side tooling (drizzle-kit): DATABASE_URL only
cp .env.example .env

# Apply the schema to your Neon database
npm run db:migrate

npm run dev          # Next dev server → http://localhost:3000
npm run seed         # optional: a demo group to click around
```

No Neon account for local work? Run a local Postgres and
`SHIM_TARGET=postgresql://… npm run db:shim`, then set
`NEON_HTTP_PROXY_ENDPOINT=http://127.0.0.1:4445/sql` in `.dev.vars`.

## Useful commands

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run preview      # build + run under workerd (wrangler dev) — do this before deploying
npm run deploy       # MIGRATES the .env database, then builds + deploys
npm run db:generate  # generate a migration after editing src/db/schema/
npm run db:studio    # browse the database
npm run cf-typegen   # regenerate cloudflare-env.d.ts after wrangler.jsonc changes
```

## Docs

- [Deployment guide](docs/deployment/README.md) — zero-to-deployed walkthrough, no experience assumed
- [Roadmap](docs/ROADMAP.md) — what's built and what's next, phase by phase
- [Architecture](docs/ARCHITECTURE.md) — data model, metadata pipeline, deployment shape
- [Decisions](docs/DECISIONS.md) — why things work the way they do, including the 2026-09 redesign
- [CLAUDE.md](CLAUDE.md) — conventions and invariants for AI-assisted development

## License

[GPL-3.0](LICENSE)
