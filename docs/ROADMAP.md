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

## Phase 9 — Tabletop core ✅ (done)

- `games.game_type` (`video`/`ttrpg`/`boardgame`, default backfills) +
  `tabletop_details` 1:1 sidecar: system, format (virtual/in-person/hybrid),
  free-text platform, GM, min/max players, TTRPG length band, board-game
  playtime (migration 0010, purely additive)
- Effort adaptation with zero formula changes: length bands → hour-
  equivalents (`TTRPG_BAND_HOURS` 4/15/35/110 → 1/3/5/13 pts), playtime ÷ 60
  for board games, crunch 1–5 riding the difficulty column/multipliers
- `proposeTabletopGame` (structured entry; video propose untouched),
  per-type scoring editor (band/minutes + crunch, never raw hours), type
  badges + system·format·platform·GM·players info line on cards
- Refresh + metadata cron guarded to video/BGG-pinned rows

## Phase 10 — Tabletop-aware picker ✅ (done)

- "What kind of night?" chips (`kind` in the /pick URL context) — a filter,
  not a scored component
- Party fit from declared player ranges for tabletop (below-min 0.05,
  above-max 0.3); video keeps the gameModes path; timeFit unchanged
  (hour-equivalents already classify correctly)
- Type badges, TTRPG system display (no raw hours), board-game minutes,
  player-range lines in the pick list

## Phase 11 — Campaign sessions ✅ (done)

- `scheduleNextSession`: clone-forward +7 days (same game/duration/location,
  trailing session number bumped, creator auto-RSVP, Discord ping) — the
  deliberate alternative to a recurrence engine
- Wrap-up form checkbox ("same time next week") + button on completed events
- Campaign strip on playing tabletop cards: sessions held · next date

## Phase 12 — BGG metadata provider ✅ (done)

- `bgg` provider over the BGG XML API2 (BoardGameGeek + RPGGeek, one id
  space; `BGG_API_TOKEN` bearer secret, optional — no token degrades to
  manual entry); fast-xml-parser, 202-queue retry
- Search-first tabletop proposing: BGG typeahead + preview prefill the
  structured form (editable; server refetches by id, dedups on `bgg_id`)
- Board games: rating, 1–5 weight (crunch prefill), playtime, player range.
  RPG items: rating + taxonomy only (no weight/playtime exists — expected)
- `bggRating` joins the quality signals (points + picker); structured
  prefills are propose-only, never rewritten on refresh; cron refreshes
  BGG-pinned tabletop rows (migration 0011, additive)

## Phase 13 — Coordination polish & fixes ✅ (done)

- Event scheduling hardened: past dates rejected (server + picker `min`) on
  both the create-event form and GAC polls, 15-minute increments enforced,
  and the client date→ISO conversion guarded so a bad value shows a field
  error instead of crashing
- A proposal needs a second: `transitionGameStatus` blocks the proposer from
  adding their own game to the backlog (self-voting stays — anonymity)
- Per-viewer burn-rate period toggle (weekly/monthly/yearly/all-time) via
  `?period=` + a `nq-burn-period` cookie; projection stays weekly-based

## Phase 14 — Browse & game detail ✅ (done)

- `/backlog/[gameId]` detail page: full pitch/description/metadata, tabletop
  info line, and per-game session history (events joined on `game_id`); cards
  link through by art + title
- Backlog Type/Genre/Mode/Tags filter rows (vocabulary from the library),
  composing with sort; a Genre filter on `/pick` alongside the `kind` chips
- Completion moved off the card face into the Manage expander + detail page
  (`completed` is terminal — no accidental one-tap)

## Phase 15 — Session capture ✅ (done)

- Wrap-up captures `recap`, a 1–5 `how_it_went` rating, a `progress_note`
  ("where we left off"), and confirms *what was actually played* — recap now
  has its own column so planning notes survive (migration 0012)
- Recap/rating/progress shown on completed event cards and the game detail
  Sessions card

## Phase 16 — RAWG provider ✅ (done)

- `rawg` provider (optional `RAWG_API_KEY`) supplements Steam with
  art/description/genres/release/Metacritic when Steam is blank; gated to a
  no-op without a key; joins the video typeahead and `fetchGameMetadata`
  (migration 0013 — `metadata_source` gains `rawg`)

## Phase 17 — Onboarding & small cuts ✅ (done)

- First-time user tutorial (issue #13): a five-step welcome tour modal
  auto-opens once per member (`user.tutorial_seen_at`, migration 0014;
  app-owned, not a Better Auth field), ends on a "propose your first game"
  CTA, and stays replayable from the user menu (window-event handshake
  between the two client islands — no context plumbing)
- Keyboard navigation for the propose-form search dropdown: arrow keys with
  wrap-around, Enter selects the highlighted candidate, Escape closes;
  `aria-activedescendant`/`aria-selected` wired, hover and keyboard share
  one highlight
- A real `events.session_number` column (migration 0014 + 0015 backfill from
  trailing title digits): seeded at creation, incremented by clone-forward
  (column first, title digits as legacy fallback); dashboard activity gains
  "wrapped up <session> playing <game> · n/5" rows from completed events

## Phase 18 (proposed) — Engineering foundation

The app has shipped 17 phases with no safety net: no CI, no automated
tests, no error pages. Every recent regression (the events 500, the HLTB
breaks) was caught by a user, not a machine — this phase makes the machine
catch them first.

- GitHub Actions CI: `typecheck` + `lint` + `build` on every push and PR
- Dependabot config + a one-time dependency-vulnerability remediation pass
  (16 known advisories on the default branch as of 2026-07)
- Vitest unit tests for the pure-logic core — `src/lib/points.ts`,
  `src/lib/pick.ts`, `src/lib/burn-rate.ts` — and the provider parsers
  (HLTB/BGG/Steam normalization, using fixtures captured from stored
  `game_metadata.raw` payloads; parser drift is the app's most recurrent
  breakage)
- Error surfaces: `error.tsx` + `not-found.tsx` boundaries (uncaught action
  errors currently show Next's raw error screen — issue #17's "404" was
  this), plus a catch pattern for the admin forms that invoke throwing
  actions bare
- `loading.tsx` skeletons — every page is force-dynamic with DB queries,
  so navigation feels dead until the server answers
- Mobile navigation: the nav bar's four links don't collapse; add a
  hamburger below `sm` (this app gets used on phones at the table)
- `scripts/seed.ts` for local dev — a demo group with games in every
  status, events, votes, and polls

## Phase 19 — Coordination polish ✅ (done)

- Wrap-up nudge (#23): the hourly reminder cron also sends one Discord
  nudge when a session has sat unwrapped ~12h past its start — same
  claim-marker pattern (`events.wrap_up_nudge_sent_at`, migration 0016),
  so a repeated tick can't double-send; wrapping up or cancelling first
  prevents it
- iCal subscription feed (#24): `/api/calendar?token=…` serves RFC 5545
  (`src/lib/ical.ts`, unit-tested) — scheduled + recent events, cancelled
  ones as STATUS:CANCELLED, stable UIDs so edits propagate. The token is
  derived from `BETTER_AUTH_SECRET` (no new secret; rotate it to revoke),
  and the events page shows a copyable subscribe URL
- Structured event venue: `events.venue` (virtual / in-person / hybrid,
  migration 0016) alongside free-text location — sessions carry their own
  how-we-meet signal independent of the game's declared format; set at
  creation, copied by clone-forward, shown on cards and in the feed
- Avatar referrer fix (#7) shipped with the mobile-nav work; deployment-doc
  issues #5/#6 were already fixed by the WS6 docs refresh and closed

## Phase 20 (proposed) — History & identity

- Per-member history page: what I proposed / played / rated (member stats
  are currently two numbers)
- "Year in review": burn-rate + sessions + ratings already hold the data
  for a fun periodic group artifact
- Data export (JSON/CSV of games, history, events, recaps) — the group's
  history is the app's most precious data and currently has no way out
- Picker transparency: a "why this?" one-liner per ranked game so the
  five-factor score never feels like a black box

## Future ideas (unscheduled)

- IGDB provider (needs a Twitch OAuth client-credentials exchange — deferred
  behind RAWG, similar coverage)
- DriveThruRPG page-count crunch heuristic for TTRPGs (undocumented API —
  research 2026-07: page count is the best available crunch proxy)
- Community crunch ratings (accumulate our own BGG-style weight over time)
- A dedicated "mood" taxonomy for the picker (today mood rides genre/mode/tags)
- `user_preferences` table once a second per-user preference appears (the
  burn-period cookie is fine alone; notification opt-outs or a default pick
  context would justify it)
- PWA/installability (manifest + icons) for home-screen access on phones
