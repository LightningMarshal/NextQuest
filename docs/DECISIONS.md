# Decisions

Lightweight ADR log. Add new entries at the bottom with a date.

## 2026-06-10 — Cloudflare Workers + Neon over self-hosted Docker

The app is designed for the README stack: Next.js on Cloudflare Workers
(`@opennextjs/cloudflare`) with Neon Postgres. Low-maintenance and
free-tier friendly for a friend group. Consequence: the DB driver must be
Neon's HTTP driver and env access goes through `getCloudflareContext()`.

## 2026-06-10 — Single-tenant, no groups table

One deployment = one group. Membership is `user.role` + `user.status`
(admin approval after Google sign-in). Keeps every query and page free of
group scoping. If multi-group is ever needed, that's a fork-level refactor
we accept.

## 2026-06-10 — Proposals are a game status, not a table

A proposal is a `games` row with status `proposed`. One entity, one
lifecycle (`proposed → backlog → playing → completed`, plus
`abandoned`/`rejected`), one history table. Proposer identity is public —
only *votes* are anonymous.

## 2026-06-10 — Points formula: Fibonacci length buckets × difficulty multiplier

`points = lengthPoints(hours) × difficultyMultiplier(1–5)`, rounded.

- Length (HLTB Main+Extra): <5h→1, 5–12→2, 12–25→3, 25–50→5, 50–100→8, 100+→13
- Difficulty: 1→×0.8, 2→×1.0, 3→×1.2, 4→×1.5, 5→×2.0 (tunable in
  `app_settings.difficulty_multipliers`)

Examples: Elden Ring (~100h, diff 5) → 26 pts; Portal (~5h, diff 2) → 2 pts.

Fibonacci buckets dampen HLTB estimate noise. Points are **stored** and only
recomputed on explicit edit, so completed games keep their historical value
when the formula is tuned — burn-rate charts never rewrite history.

*Amended by the 2026-06-12 "Points formula v2" entry below.*

## 2026-06-10 — Voting: anonymous budget allocation

Each approved member gets `vote_budget` (10) points to spread across
`backlog` games, max `vote_max_per_game` (4) per game. Priority =
`SUM(weight)` descending. Continuous — reallocate any time.

- vs. plain upvotes: captures intensity, not just breadth.
- vs. ranked choice: no elimination rounds, trivial to tally and explain.
- The per-game cap is a mild quadratic-voting effect: you can't dump your
  whole budget on one game.

Anonymity: votes are tied to `user_id` strictly for dedup/upsert; every read
path returns aggregates only. Votes are deleted when a game leaves `backlog`
(budget returns to the member).

## 2026-06-10 — Game metadata: Steam + HowLongToBeat behind a provider interface

Steam storefront API (unauthenticated) is primary: art, genres, reviews,
metacritic. HLTB supplies time-to-beat but has **no official API** — any
integration is a scraper that breaks without notice. Hence
`GameMetadataProvider` + an orchestrator with per-provider try/catch and a
manual-entry fallback: a broken provider means fewer prefilled fields, never
a blocked proposal. IGDB/RAWG can be added later as new providers.

## 2026-06-10 — UI: Tailwind v4 + vendored shadcn/ui components

shadcn-style components are vendored into `src/components/ui/` (the registry
was unreachable from the scaffold environment; `components.json` is set up
so `npx shadcn add` works when it isn't). Theme: dark default with a cyan
accent, light mode via `next-themes` class switching, tokens in
`globals.css`.

## 2026-06-12 — Points formula v2: quality multiplier

`points = max(1, round(lengthPoints(hours) × difficultyMultiplier × qualityMultiplier))`

The group wanted acclaim to count: finishing a great game should be worth
more than finishing a mediocre one of the same length. The new factor:

- `q` = mean of the available review signals (Steam % positive, Metacritic
  metascore, both 0–100); missing signals are skipped; both missing → the
  factor is neutral (×1.0).
- `qualityMultiplier = 1 + weight × (q − 70) / 100`, clamped to 0.5–1.5.
  Baseline 70 ≈ "a decent game" is neutral; at the default weight 0.5 a
  90-rated game earns ×1.10 and a 50-rated one ×0.90.
- `weight` lives in `app_settings.quality_weight` (0–1, admin-tunable);
  **weight 0 reproduces v1 exactly**.
- The `max(1, …)` floor is new and deliberate: a short, easy, poorly-rated
  game must still be worth at least 1 point when completed.

Updated example: Elden Ring (~100h, diff 5, q≈94) → 13 × 2.0 × 1.12 →
**29 pts** (was 26).

Stored-points rules survive unchanged, with one addition: besides explicit
scoring edits, an **admin-only recompute action** re-runs the formula — but
only for `proposed` and `backlog` games. Playing/completed/abandoned games
are never touched (burn-rate history stays stable), and `pointsOverride` is
left alone (it wins over `points` at every read site). Note the interplay
with the metadata-refresh cron: refreshed review scores do NOT trigger any
recompute; they only matter at the next scoring edit or admin recompute.

## 2026-07-02 — Session-aware picker over pure vote ranking

The old split conflated two jobs: `points` (really an effort/size estimate)
was displayed as if it ranked games, and the vote tally — the actual
selection mechanism — ignored review quality, available time, and how long
a game had been rotting. Reconsidered from scratch:

- **Points survive, demoted to what they are**: the effort currency behind
  burn-rate. UI now says "effort"; DB columns and every stability rule
  (stored, recompute only on edit / admin action for pre-play games) are
  unchanged.
- **Budget voting survives as the *interest* signal.** Anonymity
  effectively requires an aggregate-friendly preference mechanism, and
  budget allocation is a good one — it just stops being the whole ranking.
  All mechanics unchanged (budget 10, cap 4, aggregates only, cleared on
  leaving backlog).
- **New: the picker** (`/pick`, absorbing `/vote` which now redirects).
  `score = 100 × Σ ŵᵢ·cᵢ` over components computed per backlog game:
  - *interest* = tally / max tally (0 when no votes anywhere)
  - *quality* = clamp((q − 40)/60, 0–1); q = the points formula's
    `qualityScore` (Steam % + Metacritic mean); missing → 0.5. Deliberate
    contrast with points, where missing data is neutral ×1.0: in a ranking,
    "we know nothing" belongs between acclaimed and panned.
  - *timeFit*: session commitment presets map to Main+Extra hour ranges
    (snack <8, weeknight 8–25, standard 25–60, epic 60+); in range → 1,
    outside decays by `1 − |log2(L/bound)|/1.5`; a game finishable in
    tonight's stated hours (≤ hours × 1.25) floors at 0.95. Unscored → 0.5.
  - *staleness* = min(1, days-in-backlog/120), from the latest
    `to_status='backlog'` history row (re-backlogging restarts the clock).
  - *partyFit*: from `game_metadata.game_modes` (derived from Steam
    appdetails categories); active only when the session says "playing
    together, N ≥ 2" — co-op/multiplayer 1, unknown 0.5, single-player 0.1.
  - Admin weights (`app_settings.pick_weights`, defaults .35/.25/.15/.15/.1)
    are stored raw and renormalized at read time over the active set.
- **Scores are computed at read time and NEVER stored** — the mirror image
  of the points invariant. Nothing to migrate when the formula is retuned,
  and burn-rate history can't be rewritten by ranking changes.
- **Session context lives in the URL** (`/pick?hours=3&commitment=snack&
  together=1&players=4`): shareable, no new tables, and the force-dynamic
  layout re-ranks on every change. A "use next session" button prefills
  from the next scheduled event's duration + yes-RSVPs.
- **Accepted tradeoff:** voting on /pick reorders the list on the server
  round-trip (the ranking responding to interest is the feature). Scores
  are never recomputed client-side from optimistic votes.

Game input became **search-first**: type a title, pick from Steam +
HowLongToBeat candidates (searched in parallel, either may fail
independently), preview the fetched metadata with per-source status and
retry, or drop to manual entry at any point. The proposal submits only
candidate *ids* — the server refetches metadata itself, never trusting
client-supplied fields. A per-game "Refresh metadata" action is the
post-hoc recourse when a provider was down at proposal time (unlike the
cron it also runs on manual-only rows, deliberately, since the user asked).
HLTB caveat: their search matches names, not ids, so "fetch by id" is
implemented as a title search filtered to the picked `game_id`, falling
back to the title heuristic.

## 2026-07-05 — Tabletop expansion: game_type + tabletop_details sidecar

The group wants to coordinate TTRPGs (D&D 5e, Delta Green, …) and board
games through the same propose → vote → pick → schedule flows. Modeled as
a `game_type` discriminator on `games` (`video`/`ttrpg`/`boardgame`,
default backfills existing rows) plus a 1:1 **`tabletop_details`** sidecar
(system, format virtual/in-person/hybrid, free-text platform à la
`events.location`, GM user ref, min/max players, TTRPG length band,
board-game playtime minutes) — mirroring the `game_metadata` precedent so
tabletop attributes never widen the games table. NOT a second entity:
one lifecycle, one history table, one votes table (all already
type-agnostic), same "proposals are a status" rule.

## 2026-07-05 — Tabletop effort: hour-equivalents through the existing formula

Tabletop games join the one shared effort/burn-rate economy — no second
currency, no second chart. Two deliberate column overloads make the entire
points/pick math byte-identical:

- **Length**: TTRPGs are proposed as descriptive bands (one-shot / arc /
  mini-campaign / campaign) mapped to representative hour-equivalents
  (`TTRPG_BAND_HOURS`: 4/15/35/110 — chosen to land in the existing
  Fibonacci buckets as 1/3/5/13 pts); board games store playtime ÷ 60.
  The hour value in `games.length_hours` is internal currency: **bands and
  minutes are the only display surface for tabletop** — the UI never shows
  the raw hours, so their false precision stays private.
- **Crunch**: rules complexity 1–5 (ultra-light → very heavy) rides the
  `games.difficulty` column and the same admin-tunable multipliers. There
  is no authoritative TTRPG complexity data anywhere; group-assigned, with
  BGG's community weight as an editable prefill for board games.

Board-game completion convention: a board game moves playing → completed
when the group has had its fill (typically after the first play-through)
and earns its stored points once; replays are *events*, not points —
per-session point accrual would be the first write path to touch points
outside a scoring edit and dies on invariant #2.

## 2026-07-05 — Picker: night type is a filter, party fit uses player ranges

`/pick` gains `kind` (any/video/ttrpg/boardgame) in the session context —
a **filter**, deliberately not a scored component: "board game night" and
"should we start a campaign?" are different questions, and a soft weight
would just blend them into mush. Party fit branches: tabletop games use
their declared min/max player range (real data, so sharper penalties —
below min 0.05, above max 0.3) while video games keep the derived
`gameModes` heuristic. Time fit needed no change: the hour-equivalents
already classify a 90-minute board game as a snack and a campaign as epic.
Read-time-only scoring is untouched.

## 2026-07-05 — Session recurrence: clone-forward, not a rules engine

Weekly campaigns need "same time next week", not RRULE. A recurrence
engine (materialization horizons, edit-this-vs-all-future, reminder
interactions) is complexity the group doesn't need; an explicit
`scheduleNextSession` action clones an event +7 days (same game, duration,
location; trailing session number bumped), offered as a checkbox on the
wrap-up form and a button on completed events. Only the caller is
auto-RSVP'd — seeding others' RSVPs from past attendance would make RSVPs
dishonest (revisit if the group wants attended→maybe seeding). GAC polls
remain the tool when the weekly slot breaks.

## 2026-07-05 — Tabletop metadata: one BGG provider, propose-only prefill

BoardGameGeek and RPGGeek share one XML API2 and one id space, so a single
`bgg` provider serves both game types (`type=boardgame,rpgitem`;
externalId `"<type>:<id>"`). The API now requires a registered bearer
token (`BGG_API_TOKEN`, optional secret): no token → the provider throws →
the standard degradation contract lands proposals in manual entry.
Board games carry real community weight/playtime/player-count; **RPG items
carry neither weight nor playtime nor player counts** — that data does not
exist on the site, so TTRPG length/crunch stay group-assigned forever.
`bggRating` (0–100 rescale) joins the quality signals. Structured fields
(playtime, players, crunch-from-weight, system) prefill **at propose time
only and are never written on refresh** — the tabletop analog of "refresh
never touches games.*"; refresh only updates `game_metadata` (art,
description, genres, bggRating/bggWeight). DriveThruRPG page-count crunch
seeding stays a future idea: the API is undocumented and the proxy is weak.

## 2026-07-12 — Backfilled: member tags + vote-milestone pings

Two features that shipped before this log existed, recorded for completeness:

- **Member tags** (`tags`/`game_tags`): a free-form shared vocabulary
  alongside the structured `game_type` and provider genres. Names are
  normalized (trim + lowercase) and unique so "RPG"/"rpg" don't fork;
  zero-assignment tags are kept as filter/autocomplete vocabulary.
- **Vote-milestone Discord pings**: when a game's group total crosses a
  configured threshold (`app_settings.vote_milestones`, default [5,10,15]) it
  pings Discord once *ever*. The `game_vote_milestones` ledger (PK
  `(game_id, milestone)`) makes "notify once" an atomic
  `onConflictDoNothing` — no transactions on Neon HTTP. Only aggregate totals
  are used, so the anonymity invariant holds.

## 2026-07-12 — A proposal needs a second

`transitionGameStatus` blocks the `proposed → backlog` move when the caller
is the game's proposer ("someone else has to add your proposal"). Cheap
guard against a member unilaterally promoting their own pick; every other
transition stays open to any member. Voting on your own game is **not**
blocked — votes are anonymous, and disabling a member's own games on the
ballot would leak which ones are theirs.

## 2026-07-12 — Burn-rate period toggle: URL + cookie, weekly projection

Each viewer can switch the burn-rate x-axis (weekly / monthly / yearly /
all-time). No per-user settings table exists (single-tenant, `app_settings`
is global), and one isn't worth it for a view preference: the choice rides a
`?period=` param (shareable, re-rendered by the force-dynamic layout) plus a
`nq-burn-period` cookie so it sticks per browser. `all-time` reproduces the
pre-toggle view, so the default is unchanged. The projection always regresses
over the **weekly** series regardless of the displayed bucket — its
`slice(-12)` window and points/week units assume weeks, and re-deriving per
period would add noise for no gain.

## 2026-07-12 — Session capture: columns on events, recap ≠ notes

Wrapping up a session used to write the recap into `events.notes` — the same
column as the pre-session planning notes — destroying the plan. Fixed by
giving the post-session write-up its own columns on `events` (1 event = 1
session, so no sidecar): `recap`, `how_it_went` (1–5), `progress_note`
(campaign continuity). Wrap-up also confirms *what was actually played*
(editable game link, defaulting to the plan). Additive migration; no
points/vote surfaces touched. Deferred: dashboard activity rows for completed
sessions, and promoting the title-embedded session number to a real column —
neither is needed for the capture goals.

## 2026-07-12 — RAWG as a Steam supplement; IGDB deferred; mood = filters

RAWG joins as a *supplement*, not a peer: it fills art/description/genres/
release/Metacritic that Steam left blank, and Steam stays canonical (its
review % and category-derived play-modes have no RAWG equivalent). Gated
behind an optional `RAWG_API_KEY` via `rawgConfigured()`, so a keyless
deployment is a complete no-op — no requests, no spurious failures in the
propose UI — matching the BGG/Discord optional-secret pattern. `rawgId` is
threaded through preview/propose exactly like `hltbId`; `metadata_source`
gains `rawg` (append-only). **IGDB deferred**: its Twitch OAuth
client-credentials exchange is more surface for similar coverage. A dedicated
**mood** taxonomy is also deferred — mood rides the existing genre/mode/tag
filters (a member can make a "chill" or "brainburner" tag today).
