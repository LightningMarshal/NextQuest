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

## Phase 5 — Events ✅ (done)

- Create-session form (title, optional game from playing/backlog, when —
  converted to ISO in the browser so timezones survive, duration, location,
  notes); creator auto-RSVPs yes
- RSVP yes/maybe/no with public name lists (attendance isn't anonymous —
  only votes are); RSVPs close once the event is wrapped up
- "Needs wrap-up" flow for past scheduled events: member checklist
  (pre-checked from RSVPs), recap notes, completes the event; or "it never
  happened" → cancelled. `rsvp` made nullable (migration 0001) so
  attendance-only rows exist for walk-ins
- Dashboard "Next sessions" cards (next 3, with yes-counts); times render
  in the viewer's browser timezone via `LocalTime`

## Phase 6 — GAC (Gamer Availability Checker) ✅ (done)

- `availability_polls` / `availability_options` / `availability_responses`
  tables + `events.availability_poll_id` (migration 0002 — purely additive,
  exactly as designed in docs/ARCHITECTURE.md)
- "Find a time" section on /events: propose slots (shared session length,
  browser-timezone-correct), members answer Free / If need be / Busy;
  responses are public, leading slot highlighted (yes×2 + if-need-be)
- "Schedule this" turns a slot into an event: seeds RSVPs from responses
  (yes→yes, if-need-be→maybe, no→no) and closes the poll; manual close
  supported; proposer auto-marked free for their own slots

## Phase 7 — Polish ✅ (done)

- Activity feed on the dashboard (status transitions from
  `game_status_history` + newly scheduled events, merged, latest 12)
- Member stats card: proposals made + sessions attended (of total held)
- Discord webhook notifications via optional `DISCORD_WEBHOOK_URL`
  (`src/lib/discord.ts`, fire-and-forget on waitUntil): new proposal,
  started/finished a game, session scheduled (manual or from a GAC poll)

## Phase 8 — The picker & search-first propose ✅ (done)

- `/pick` ("What's next?") replaces `/vote` (which redirects): a
  session-aware composite ranking over the backlog — interest (anonymous
  vote tally), acclaim, time fit, staleness, party fit — with the ballot
  steppers inline; math in `src/lib/pick.ts`, rationale in
  docs/DECISIONS.md (2026-07-02). Scores computed at read time, never
  stored
- Session context in the URL: hours tonight, commitment presets
  (snack/weeknight/standard/epic), playing-together + player count, and a
  "use next session" prefill from the next scheduled event
- Points relabeled **effort** in the UI (burn-rate currency only; columns
  and stability rules unchanged); picker weights admin-tunable in settings
- Search-first proposing: title typeahead across Steam + HLTB, candidate
  pick with cover/year/source, metadata preview with per-source status and
  retry, manual entry always reachable; server refetches from candidate ids
- `game_metadata.game_modes` derived from Steam categories (admin backfill
  reads stored raw payloads, no network); per-game "Refresh metadata"
  action as the in-app recourse when a provider was down

## Future ideas (unscheduled)

- Additional metadata/search providers (IGDB, RAWG) behind the existing
  provider interface
- Mood/genre filters as picker context
- Keyboard navigation for the propose-form search dropdown
