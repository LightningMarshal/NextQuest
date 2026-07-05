# Architecture

## Deployment shape

```
Browser ──► Cloudflare Worker (Next.js via @opennextjs/cloudflare)
                 │
                 ├──► Neon Postgres (HTTP driver, per-request client)
                 ├──► Steam storefront API (metadata, unauthenticated)
                 └──► HowLongToBeat (unofficial — expected to break, optional)
```

Single-tenant: one deployment is one gaming group. There is no `groups`
table; membership is `user.role` (`admin`/`member`) + `user.status`
(`pending`/`approved`/`rejected`).

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
plus membership fields on `user`: `role` and `status` enums. Mirror any auth
config change here (see CLAUDE.md invariant #4).

### Games (`games.ts`)

- **`games`** — the core entity. A *proposal is a game in `proposed` status*;
  there is no separate proposals table. Lifecycle:

  ```
  proposed ──► backlog ──► playing ──► completed
      │            │           └─────► abandoned
      └─► rejected └────────────────► abandoned
  ```

  Scoring fields: `length_hours` (HLTB Main+Extra by convention),
  `difficulty` (1–5, group-assigned), `points` (stored formula output),
  `points_override` (wins when set). `started_at`/`completed_at` support the
  dashboard.

- **`game_metadata`** — 1:1 with `games`, kept separate so provider failures
  never block a game row. Holds art URLs, description, genres, review
  scores, HLTB times, `game_modes` (play-mode vocabulary derived from Steam
  appdetails categories — feeds the picker's party-fit component; null =
  never derived), and the `raw` provider payloads (re-derive fields later
  without refetching — the game-modes admin backfill does exactly this).
  `fetched_at` enables staleness-based refresh.

- **`game_status_history`** — append-only transition log (`from_status`,
  `to_status`, `changed_by`, `changed_at`). Burn rate = sum of points of
  games transitioning to `completed`, bucketed by week. Also the future
  activity feed source.

### Votes (`votes.ts`)

Budget-allocation voting (rationale: docs/DECISIONS.md). One row per
member×game, `unique(game_id, user_id)`, `weight` 1..`vote_max_per_game`.
Since the 2026-07-02 redesign the tally is the *interest* input to the
picker rather than the whole ranking; the ballot UI lives on `/pick`.

**Anonymity invariant:** `user_id` is for dedup/upsert only. All read paths
aggregate to `{game_id, SUM(weight)}`; the only per-user read is the
requesting member's own ballot.

### Events (`events.ts`)

- **`events`** — title, optional `game_id`, `scheduled_at`, duration,
  free-form `location`, notes, status (`scheduled`/`completed`/`cancelled`).
- **`event_attendance`** — PK `(event_id, user_id)`, `rsvp`
  (`yes`/`no`/`maybe`) before, `attended` boolean recorded after.

### Settings (`settings.ts`)

`app_settings` is a single-row table (`check id = 1`): group name, vote
budget (10), per-game vote cap (4), difficulty multipliers (jsonb), quality
weight, vote milestones, and `pick_weights` (jsonb — the picker's component
weights, stored raw and renormalized at read time) — the tunables,
changeable without a deploy.

### GAC (`availability.ts`) — built in Phase 6

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
(`fetchGameMetadata`) merges providers with per-provider try/catch:

- **steam** — unauthenticated storefront endpoints (`storesearch`,
  `appdetails`, `appreviews`): art, description, genres, release date,
  metacritic, review score. Cache in `game_metadata`; don't refetch per view.
- **hltb** — unofficial (no public API); supplies only the three time
  fields. Expected to break periodically; failures surface as "fill in
  manually", never as errors that block.
- **manual** — explicit pass-through fallback so "no provider data" is a
  supported state.

## Points ("effort") & burn rate

Formula in `src/lib/points.ts` (pure, unit-testable), v2:
`points = max(1, round(fibonacciLengthBucket(hours) × difficultyMultiplier
× qualityMultiplier))` — the quality factor scales with Steam %/Metacritic
around a baseline of 70 (weight in `app_settings.quality_weight`; 0
reproduces v1). Stored on the game row; recomputed only on explicit scoring
edits or the admin recompute action (pre-play games only). The UI labels
this value **effort** — it is a size estimate for burn-rate, not a ranking.
See docs/DECISIONS.md for buckets and rationale.

Burn rate (Phase 4): weekly cumulative completed effort from
`game_status_history`, with a linear projection to estimate backlog
completion date.

## The picker (`/pick`)

The selection surface (Phase 8; rationale and math in docs/DECISIONS.md,
2026-07-02). `src/lib/pick.ts` is a pure scoring lib mirroring
`points.ts`/`burn-rate.ts`: `scoreBacklog(games, ctx, weights)` combines
interest (vote tally aggregates), quality, time fit, staleness, and party
fit into a 0–100 score per backlog game. Scores are computed at **read
time and never stored** — deliberately opposite to points, so ranking
changes can't rewrite burn-rate history.

Session context (hours tonight, commitment preset, playing
together/player count) is carried in `/pick` query params — the
force-dynamic `(app)` layout re-ranks server-side on every change, and the
URL is shareable. `src/server/pick.ts` assembles the inputs
(`parsePickContext` clamps garbage params instead of throwing); the ballot
steppers live on the same page, feeding the interest component.

Game input is search-first: `src/server/metadata-search.ts` exposes
typeahead candidates (Steam storesearch + HLTB, in parallel) and an
advisory metadata preview; proposals submit candidate ids and the server
refetches authoritatively. `refreshGameMetadata` (per game, in the backlog
card's Manage expander) is the retry path when a provider was down;
`src/server/metadata-write.ts` holds the shared only-overwrite-returned-
fields merge used by both it and the refresh cron.
