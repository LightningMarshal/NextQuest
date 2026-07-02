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
