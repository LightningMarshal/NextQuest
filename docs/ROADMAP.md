# Roadmap

Phases are ordered by dependency: auth gates everything, the backlog feeds
voting, voting + history feed the dashboard, events stand mostly alone, and
GAC builds on events.

## Phase 0 — Scaffold ✅ (done)

Project skeleton: Next.js 16 on Cloudflare Workers (OpenNext), full Drizzle
schema + initial migration, Better Auth wiring, metadata provider interface,
theme system (dark/light), route + server-action stubs, docs.

## Phase 1 — Auth & membership ✅ (done)

- Google sign-in via Better Auth (`authClient.signIn.social`)
- Server-side gate (`requireApprovedUser` in the `(app)` layout — no
  middleware): signed-out → `/sign-in`; signed-in but `status != approved` →
  `/pending-approval`
- `/admin`: list pending members, approve/reject/revoke, grant/revoke admin
- First-admin bootstrap: `ADMIN_EMAILS` env var — listed emails arrive as
  approved admins on first sign-in

## Phase 2 — Backlog core ✅ (done)

- Game proposal form (title + optional Steam link/app id + pitch) with
  metadata auto-fetch on submit
- Metadata pipeline: Steam storesearch/appdetails/appreviews + HLTB lookup
  (endpoint+key discovered from their JS bundle at request time), manual
  fallback when either fails (`src/lib/metadata/`)
- Points: length auto-filled from HLTB Main+Extra, difficulty set via "Edit
  scoring", stored points recomputed on edit, manual override supported
- Status lifecycle UI — all transitions via `transitionGameStatus`, which
  validates moves, stamps started/completed, appends history, and clears
  votes when a game leaves the backlog
- Backlog list grouped by status with art, points/needs-scoring badges,
  genres, review %, proposer, and pitch

## Phase 3 — Voting ✅ (done)

- Ballot UI on /vote: optimistic +/− steppers allocate your budget (default
  10 pts, max 4/game) across backlog games; shows your own allocations +
  remaining budget, ordered by group priority
- Backlog section ordered by aggregate tally with a "group votes" badge;
  tally exposed as totals only (`getVoteTally`)
- Server-side guards: backlog-status check, per-game cap, budget cap
  (re-checked against the DB), upsert on (game, user); weight 0 deletes
- Votes auto-cleared when a game leaves `backlog` (frees budget — done in
  Phase 2's `transitionGameStatus`)

## Phase 4 — Dashboard & burn rate ✅ (done)

- Stat cards: completion % (+ progress bar), games finished, backlog count
  (with needs-scoring hint), points/week burn rate
- Burn-rate chart (Recharts): cumulative completed points per Monday-start
  week from `game_status_history`, with the backlog total as a reference
  line and a dashed projection segment
- Projected completion date: least-squares slope over the last 12 weeks
  (`src/lib/burn-rate.ts`, pure + unit-tested by hand); hidden when flat or
  >3 years out
- "Now playing" spotlight cards with art and started-ago

## Phase 5 — Events

- Event CRUD (title, optional game link, time, duration, location, notes)
- RSVP (yes/no/maybe) + after-the-fact attendance recording
- Upcoming events on the dashboard; session notes/recaps

## Phase 6 — GAC (Gamer Availability Checker)

- `availability_polls` / `availability_options` / `availability_responses`
  tables (designed in docs/ARCHITECTURE.md; additive migration)
- Poll UI: propose time slots, members mark yes/no/if-need-be
- "Create event from winning slot"

## Phase 7 — Polish & extras

- Activity feed (from `game_status_history` + events)
- Discord webhook notifications (new proposal, vote milestones, event
  reminders)
- Per-member stats (attendance %, games finished, points contributed)
- Scheduled metadata refresh (Workers cron) for review scores
- Game tags / filtering
