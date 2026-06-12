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
