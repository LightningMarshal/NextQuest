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

## Phase 2 — Backlog core

- Game proposal form (title + optional Steam link + pitch)
- Metadata pipeline: Steam storesearch/appdetails + HLTB lookup, manual
  fallback when either fails (`src/lib/metadata/`)
- Points assignment: length auto-filled from HLTB, difficulty set by the
  group, computed points shown with manual override
- Status lifecycle UI (`proposed → backlog → playing → completed`, plus
  `abandoned`/`rejected`) — all transitions via `transitionGameStatus`
- Backlog list with cover art, points, status badges

## Phase 3 — Voting

- Ballot UI: allocate your budget (default 10 pts, max 4/game) across
  backlog games; shows only your own allocations + remaining budget
- Backlog ordered by aggregate tally; tally exposed as totals only
- Votes auto-cleared when a game leaves `backlog` (frees budget)

## Phase 4 — Dashboard & burn rate

- Completion: points completed / total backlog points
- Burn-rate chart (Recharts): cumulative completed points per week from
  `game_status_history`
- Projected completion date (linear regression over recent weeks)
- "Currently playing" spotlight card

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
