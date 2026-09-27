# Architecture

## Deployment shape

```
Browser ──► Cloudflare Worker (Next.js via @opennextjs/cloudflare)
                 │
                 ├──► Neon Postgres (HTTP driver, per-request client)
                 ├──► Steam storefront API (metadata, unauthenticated)
                 ├──► HowLongToBeat (unofficial — expected to break, optional)
                 ├──► BGG XML API2 (BoardGameGeek + RPGGeek; bearer token, optional)
                 ├──► RAWG API (supplemental video metadata; api key, optional)
                 ├──► Discord webhooks (session cards, edited in place; optional)
                 └──► Discord OAuth + /users/@me/guilds (guest admission; optional)
```

Single-tenant: one deployment is one gaming group. There is no `groups`
table; access is `user.role` (`admin`/`member`/`guest`) + `user.status`
(`pending`/`approved`/`rejected`). See "Access" below.

Per-request clients: Workers env bindings are request-scoped, so `getDb()`
(`src/db/index.ts`) and `getAuth()` (`src/lib/auth.ts`) construct clients
inside the request, never at module top level. Neon's HTTP driver makes each
query a `fetch`, which fits this model with no connection pooling.

## Data model

Schema lives in `src/db/schema/` (domain-split, barrel-exported). IDs: Better
Auth `text` IDs for auth tables, `uuid` defaults for app tables. All
timestamps are `timestamptz`.

### Auth (`auth.ts`)

Standard Better Auth tables (`user`, `session`, `account`, `verification`)
plus membership fields on `user`: `role` (`admin`/`member`/`guest`) and
`status` enums, and two app-owned columns: `tutorial_seen_at` and
`calendar_feed_version` (bump = rotate that person's calendar URL).

### The circle (`circle.ts`, `interest.ts`)

- **`invites`** — member-minted links: `token_hash` (SHA-256; the raw token
  exists only in the URL), `max_uses`/`uses`, `expires_at`, `revoked_at`,
  `note`. **`invite_redemptions`** records who came in on which link (the
  "invited by" admins see).
- **`membership_applications`** — about / why / who-you-know, `status`
  (`pending`/`approved`/`declined`), reviewer + time.
- **`discord_webhooks`** — admin-managed targets with an `audience`
  (`all` = group server, `open` = wider server, open sessions only).
- **`game_interest`** — "keen": PK `(game_id, user_id)`, public within the
  group.

### Games (`games.ts`)

- **`games`** — the core entity. A *proposal is a game in `proposed` status*;
  there is no separate proposals table. Lifecycle:

  ```
  proposed ──► backlog ──► playing ──► completed
      │            │           └─────► abandoned
      └─► rejected └────────────────► abandoned
  ```

  `game_type` (`video`/`ttrpg`/`boardgame`) discriminates the medium; all
  three share this one lifecycle, votes, and history. Scoring fields:
  `length_hours` (video: HLTB Main+Extra by convention; tabletop: a derived
  hour-equivalent — band hours for TTRPGs, playtime ÷ 60 for board games —
  never displayed raw), `difficulty` (1–5; UI says "crunch" for tabletop),
  `points` (stored formula output), `points_override` (wins when set).
  `started_at`/`completed_at` support the dashboard.

- **`tabletop_details`** — 1:1 sidecar for ttrpg/boardgame rows (the
  `game_metadata` pattern): `system`, `format` (virtual/in-person/hybrid),
  free-text `platform` ("Roll20", "kitchen table"), `gm_user_id`,
  `min_players`/`max_players`, `length_band`
  (TTRPG), `playtime_minutes` (board game), `bgg_id` (dedup, mirrors
  `steamAppId`). Crunch and length deliberately have no columns here —
  they ride `games.difficulty`/`games.length_hours` so the formulas stay
  type-blind (docs/DECISIONS.md 2026-07-05).

- **`game_metadata`** — 1:1 with `games`, kept separate so provider failures
  never block a game row. Holds art URLs, description, genres, review
  scores, HLTB times, BGG signals (`bgg_rating` 0–100 rescale,
  `bgg_weight` 1–5 — board games only), `game_modes` (play-mode vocabulary
  derived from Steam appdetails categories — library badges and the Mode
  filter; null = never derived), and the `raw` provider payloads
  (re-derive fields later without refetching — the game-modes admin
  backfill does exactly this). `source` (`steam`/`hltb`/`bgg`/`rawg`/
  `manual`/`mixed`) records which providers contributed. `fetched_at`
  enables staleness-based refresh; `last_refresh_attempt_at` is stamped on
  every refresh try (even failed ones) so a permanently-broken provider
  can't jam the stale queue.

- **`game_status_history`** — append-only transition log (`from_status`,
  `to_status`, `changed_by`, `changed_at`). Burn rate = sum of points of
  games transitioning to `completed`, bucketed by week. Also the future
  activity feed source.

### Votes (`votes.ts`) — retired, retained

Budget-allocation voting was retired from the UI in the 2026-09 redesign
("keen" replaced it). The rows are kept, still anonymous, and still cleared
when a game leaves the backlog (so stored data stays coherent). Exports
carry totals only.

**Anonymity invariant:** `user_id` is for dedup/upsert only. All read paths
aggregate to `{game_id, SUM(weight)}`; the only per-user read is the
requesting member's own ballot.

**`game_vote_milestones`** (`votes.ts`) — a dedup ledger, PK
`(game_id, milestone)`, so a group-total crossing a configured
`app_settings.vote_milestones` threshold fires its Discord ping exactly once
ever. Retired with voting; rows retained.

### Tags (`tags.ts`)

Member-defined shared vocabulary: **`tags`** (unique normalized `name`,
`created_by`) and the **`game_tags`** join (`(game_id, tag_id)`, `added_by`).
Free-form categorization alongside the structured `game_type` and provider
genres; drives the backlog Tags filter. Zero-assignment tags are kept as
filter/autocomplete vocabulary.

### Sessions (`events.ts` — the table kept its old name)

- **`events`** — a session: title, optional `game_id`, `scheduled_at`,
  duration, `visibility` (`members`/`open`), optional `capacity`, free-form
  `location` + `join_url` + `venue`, host (`created_by`), status
  (`scheduled`/`completed`/`cancelled`), planning `notes`, and the wrap-up
  fields — `recap`, `how_it_went`, `progress_note`, `wrapped_up_at/by`,
  `auto_closed`. Reminder/nudge sent-markers gate the cron.
- **`event_discord_messages`** — PK `(event_id, webhook_key)`: the Discord
  message id per webhook, so the card is edited in place.
- **`event_attendance`** — PK `(event_id, user_id)`, `rsvp`
  (`yes`/`no`/`maybe`) before, `attended` boolean recorded after.

### Settings (`settings.ts`)

`app_settings` is a single-row table (`check id = 1`). Live settings:
`group_name` and `show_completion_stats` (legacy burn-rate on /stats). The
vote budget/cap, difficulty multipliers, quality weight, milestones, and
`pick_weights` columns are retired but retained — they document how the
frozen historical effort was computed.

### Find-a-time polls (`availability.ts`, "GAC") — /sessions/plan

Landed as the purely additive migration designed here (0002):

- **`availability_polls`** — title, creator, status (`open`/`closed`),
  optional `closes_at` (unused by the UI so far).
- **`availability_options`** — time slots (`starts_at`/`ends_at`), cascade
  on poll delete.
- **`availability_responses`** — PK `(option_id, user_id)`, response enum
  `yes`/`no`/`if_need_be`. Public within the group, like RSVPs.

`events.availability_poll_id` (nullable) marks events created from a poll's
winning slot; scheduling a slot seeds `event_attendance` from the slot's
responses (yes→yes, if-need-be→maybe, no→no) and closes the poll.

## Game metadata pipeline

`src/lib/metadata/` defines `GameMetadataProvider` (`search`,
`fetchByExternalId` → normalized partial). The orchestrator
(`fetchGameMetadata`) branches on medium — video merges steam + hltb (+ rawg
when keyed), tabletop (a `bggId` param) uses bgg alone — with per-provider
try/catch:

- **steam** — unauthenticated storefront endpoints (`storesearch`,
  `appdetails`, `appreviews`): art, description, genres, release date,
  metacritic, review score. Cache in `game_metadata`; don't refetch per view.
- **hltb** — unofficial (no public API); supplies only the three time
  fields. Expected to break periodically; failures surface as "fill in
  manually", never as errors that block.
- **bgg** — BGG XML API2, covering BoardGameGeek *and* RPGGeek (shared id
  space; externalId `"boardgame:174430"` / `"rpgitem:283355"`). Requires
  the `BGG_API_TOKEN` bearer secret; without it the provider throws and
  proposals degrade to manual entry. Board games: rating, weight, playtime,
  player range. RPG items: rating + taxonomy only (no weight/playtime
  exists). Structured fields prefill `tabletop_details` at propose time
  only — refresh never rewrites them (the tabletop analog of "refresh
  never touches `games.*`").
- **rawg** — RAWG API (keyed by the optional `RAWG_API_KEY`), a *supplement*
  to Steam: fills art/description/genres/release/Metacritic that Steam left
  blank, never overriding it. Gated by `rawgConfigured()`, so a keyless
  deployment skips it entirely (no requests, no surfaced failures).
- **manual** — explicit pass-through fallback so "no provider data" is a
  supported state.

## Sessions (the heart of the app)

Pure rules in `src/lib/sessions.ts` (tested): phase (`upcoming` → `live` →
`ended` → `completed`/`cancelled`, with a 3h default length), who may RSVP
(until the session ends), wrap up (host, admin, or someone who was in),
edit/cancel (host or admin), see (`canSeeSession`: guests → open only), and
the 48h auto-close rule. Actions in `src/server/sessions.ts`; reads in
`src/server/sessions-read.ts` (visibility applied in every query). Capped
sessions admit "in" with a conditional insert so the last seat can't be
double-booked. Wrap-up and session creation write in one `db.batch`.

Pages: `/` (This week), `/sessions` (list + history + personal calendar
feed), `/s/[id]` (the Discord link target: before → when/what/who/join;
after → outcome), `/sessions/new` + `/s/[id]/edit` (the composer),
`/sessions/plan` (find-a-time polls), `/api/sessions/[id]/ics`.

## Access

`src/server/session.ts`: `getSessionUser` (React-cached),
`requireCircleUser(returnTo)`, `requireMember(returnTo)`, `requireAdmin`.
The (app) layout gates members; (circle) pages gate themselves (see
DECISIONS 2026-09-26). Invites/applications in `src/server/circle.ts`;
Discord-server admission in `src/lib/auth.ts` (account create/update hooks
+ `src/lib/discord-guilds.ts`).

## Discord

`src/server/discord.ts`: targets = `DISCORD_WEBHOOK_URL` (audience `all`) +
enabled `discord_webhooks`. `syncSessionAnnouncement(id)` posts or PATCHes
one embed per eligible webhook (`src/lib/discord-embed.ts`, pure + tested),
deletes it from `open` webhooks if a session stops being open, and can add
a short notice line. `notifyDiscord` sends group news to `all` webhooks only.
All sends run on `waitUntil` and never fail the triggering action.

## Effort & burn rate (legacy, frozen)

Stored effort points (`src/lib/points.ts`) and the burn-rate chart predate
the redesign. Nothing writes points any more; `/stats` shows the historical
burn-down (admin toggle) computed from `game_status_history`, so the data
remains meaningful and nothing was destroyed. The five-factor picker
(`/pick`) and its tunables were retired; see DECISIONS 2026-09-26.

## Library & game detail

`/backlog` (labelled Library) groups games into Playing / Want to play /
Played / Shelved, searches titles, and filters on four composing dimensions
carried in the URL — **type**, **genre**, **mode**, and member **tags**.
Cards show art, genres/modes, time-to-beat and reception tiles, the
description, and who's keen; they carry no hidden forms (curation lives on
the game page's Manage panel). Data: `getLibrary()` in
`src/server/library-read.ts` (explicit columns, never `raw`). Cards link
(art + title) through to **`/backlog/[gameId]`**, a read/detail surface with
the full pitch, description, metadata, tabletop info line, and the game's
**session history** (completed + upcoming events joined on `events.game_id`).
Status transitions live on the game page only — `completed` is terminal
with no undo. A non-proposer marking a suggested game keen promotes it to
want-to-play through the same status path. Shared card/detail display vocabulary lives in
`src/app/(app)/backlog/game-display.ts`.
