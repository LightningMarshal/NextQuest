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
  scores, HLTB times, and the `raw` provider payloads (re-derive fields
  later without refetching). `fetched_at` enables staleness-based refresh.

- **`game_status_history`** — append-only transition log (`from_status`,
  `to_status`, `changed_by`, `changed_at`). Burn rate = sum of points of
  games transitioning to `completed`, bucketed by week. Also the future
  activity feed source.

### Votes (`votes.ts`)

Budget-allocation voting (rationale: docs/DECISIONS.md). One row per
member×game, `unique(game_id, user_id)`, `weight` 1..`vote_max_per_game`.

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
budget (10), per-game vote cap (4), difficulty multipliers (jsonb) — the
tunables, changeable without a deploy.

## Future: GAC (Gamer Availability Checker) — Phase 6

Designed now so it lands as a purely additive migration:

```
availability_polls      id uuid PK, title, created_by → user.id,
                        closes_at timestamptz, status (open|closed)
availability_options    id uuid PK, poll_id → availability_polls.id (cascade),
                        starts_at, ends_at timestamptz
availability_responses  option_id → availability_options.id (cascade),
                        user_id → user.id (cascade),
                        response enum (yes|no|if_need_be),
                        PK (option_id, user_id)
```

Plus a nullable `events.availability_poll_id` column ("event created from
the winning slot"). Nothing in the current schema needs to change.

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

## Points & burn rate

Formula in `src/lib/points.ts` (pure, unit-testable):
`points = fibonacciLengthBucket(hours) × difficultyMultiplier`. Stored on
the game row; see docs/DECISIONS.md for the buckets and rationale.

Burn rate (Phase 4): weekly cumulative completed points from
`game_status_history`, with a linear projection to estimate backlog
completion date.
