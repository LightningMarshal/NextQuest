# Next Quest

**Next Quest** is a web app for one gaming group: a shared backlog where
games earn points, anonymous voting decides what to play next, a burn-rate
chart shows whether the group will ever actually finish the pile, and
sessions get scheduled with availability polls, RSVPs, and attendance.
One deployment serves one group — members sign in with Google and are let
in by an admin.

## Feature tour

### Dashboard

The home page answers "how are we doing?" at a glance:

- **Stat cards** — completion percentage (completed points vs. total, with
  a progress bar), games finished, backlog size, and the weekly burn rate
  with a projected date for clearing the backlog.
- **Burn-up chart** — cumulative completed points per week plotted against
  the backlog total, with a dashed least-squares projection toward the
  finish line (hidden when progress is flat or the projection is hopeless).
- **Next sessions** — the next three scheduled events with times rendered
  in each viewer's timezone and RSVP counts.
- **Now playing** — art cards for in-progress games with "started X ago".
- **Activity feed** — the latest dozen status changes and scheduled events,
  with who did what.
- **Members** — per-member proposal counts and session attendance.

### Backlog

Propose a game by pasting a Steam link (or just a title): the app
auto-fills art, description, genres, review scores from the Steam
storefront API and playtime from HowLongToBeat — and degrades gracefully
to manual entry when a provider is down. Every game moves through an
audited lifecycle:

```
proposed → backlog → playing → completed
              ↑↓         ↘ abandoned   (rejected ↔ proposed)
```

Each transition is recorded in a history table, which is what makes the
burn-rate math trustworthy. Cards carry the game's points, vote total,
length, difficulty, Steam score, genres, and member-defined **tags** —
with a tag filter bar across the whole page. A scoring editor sets length,
difficulty, and an optional manual points override.

### Voting

Deciding what to play next is a budget-allocation vote, and it's
**anonymous**:

- Every member gets the same budget (default 10 points, admin-tunable) to
  spread across backlog games, capped per game (default 4).
- The ballot page shows *your* allocation and the group total — never who
  voted for what. Reallocate any time with optimistic ± steppers.
- When a game leaves the backlog its votes are deleted and the budget
  returns to members.
- Crossing a configured vote milestone fires a Discord ping (once per
  game, ever).

### Events & availability

- **Scheduling** — events with optional game link, duration, location, and
  notes; times are entered in your browser's timezone and rendered in each
  viewer's.
- **RSVPs** — yes / maybe / no with public name lists (attendance is the
  one deliberately public signal; only votes are anonymous).
- **Wrap-up** — past events prompt for an attendance checklist
  (pre-checked from RSVPs) and a recap note.
- **Availability polls** — when there's no obvious time, members propose
  slots and everyone answers Free / If need be / Busy. The leading slot is
  highlighted and converts to a real event in one click, seeding RSVPs
  from the poll answers.

### Admin

A single admin page covers the approval queue (new sign-ins wait there),
member roles, and group settings: group name, vote budget and per-game
cap, the points formula's difficulty multipliers and review-score weight,
vote milestones, and a one-click recompute of proposed/backlog points
after retuning the formula.

### Notifications & automation

With a Discord webhook configured (optional), the app announces proposals,
games started and finished, vote milestones, newly scheduled sessions,
poll results, and sends reminders ~24 hours and ~1 hour before each event.
Two cron jobs run on the deployed Worker: hourly event reminders and a
daily refresh of stale Steam/HLTB metadata.

## How it works

### The points formula

```
points = max(1, round( lengthPoints(hours) × difficultyMultiplier × qualityMultiplier ))
```

| HLTB hours | points |     | difficulty | × |     | quality |
| --- | --- | --- | --- | --- | --- | --- |
| < 5 | 1 | | 1 — breezy | 0.8 | | `q` = mean of Steam % positive |
| 5–12 | 2 | | 2 — casual | 1.0 | | and Metacritic (0–100) |
| 12–25 | 3 | | 3 — solid | 1.2 | | multiplier = `1 + w·(q−70)/100`, |
| 25–50 | 5 | | 4 — tough | 1.5 | | clamped 0.5–1.5; no data → ×1.0 |
| 50–100 | 8 | | 5 — brutal | 2.0 | | weight `w` 0–1, default 0.5 |
| 100+ | 13 | | | | | (0 disables the factor) |

Fibonacci length buckets dampen HLTB estimate noise; the difficulty
multipliers and quality weight are admin-tunable. Example: Elden Ring
(~100h, difficulty 5, ratings ≈ 94) → 13 × 2.0 × 1.12 = **29 points**;
Portal (~5h, difficulty 2, equally acclaimed) → **2 points** — the buckets
still dominate.

Points are **stored, not derived**: they change only when someone edits a
game's scoring (or an admin runs the recompute on not-yet-played games),
so completed games keep their historical value and the burn-rate chart
never rewrites history. Full rationale: [docs/DECISIONS.md](docs/DECISIONS.md).

### Why voting is anonymous budget allocation

Plain upvotes measure breadth, not how much anyone cares; ranked choice is
a pain to tally and explain. A spendable budget captures intensity, the
per-game cap adds a mild quadratic-voting effect (you can't dump
everything on one game), and anonymity keeps votes honest in a group of
friends. Votes are tied to a user only for dedup — every read path returns
aggregate totals.

### Burn rate & projection

Because every status change is appended to a history table, the app can
compute completed points per week and fit a least-squares line through
recent weeks to project when the backlog — at its current total — would be
cleared. Tune the formula all you like; history stays fixed.

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
Neon Postgres (HTTP driver,         Steam API + HowLongToBeat
per-request Drizzle client)         (metadata providers, fail-soft)
                                           │
                                    Discord webhook (optional,
                                    fire-and-forget notifications)
```

## Stack

- Next.js 16 (App Router, TypeScript) on Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- Neon Postgres + Drizzle ORM
- Better Auth (sign in via Google)
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
```

## Useful commands

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run preview      # build + run under workerd (wrangler dev) — do this before deploying
npm run deploy       # build + deploy to Cloudflare Workers
npm run db:generate  # generate a migration after editing src/db/schema/
npm run db:studio    # browse the database
npm run cf-typegen   # regenerate cloudflare-env.d.ts after wrangler.jsonc changes
```

## Docs

- [Deployment guide](docs/deployment/README.md) — zero-to-deployed walkthrough, no experience assumed
- [Roadmap](docs/ROADMAP.md) — what's built and what's next, phase by phase
- [Architecture](docs/ARCHITECTURE.md) — data model, metadata pipeline, deployment shape
- [Decisions](docs/DECISIONS.md) — points formula, voting mechanics, and other ADRs
- [CLAUDE.md](CLAUDE.md) — conventions and invariants for AI-assisted development

## License

[GPL-3.0](LICENSE)
